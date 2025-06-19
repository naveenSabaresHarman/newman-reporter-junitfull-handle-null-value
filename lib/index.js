var _ = require('lodash'),
	xml = require('xmlbuilder'),
	moment = require('moment'),
	JunitFullReporter;

// JUnit Reporter based on XSD specified by Publish Test Results task for Azure Pipeline / TFS 2018 / TFS 2017 and TFS 2015
// Source: https://docs.microsoft.com/en-us/azure/devops/pipelines/tasks/test/publish-test-results?view=vsts&tabs=yaml
// XSD: https://github.com/windyroad/JUnit-Schema/blob/master/JUnit.xsd

const SEPARATOR = ' / ';

/**
 * Resolves the parent qualified name for the provided item
 *
 * @param {PostmanItem|PostmanItemGroup} item The item for which to resolve the full name
 * @param {?String} [separator=SEP] The separator symbol to join path name entries with
 * @returns {String} The full name of the provided item, including prepended parent item names
 * @private
 */
function getParentName(item, separator) {
	if (_.isEmpty(item) || !_.isFunction(item.parent) || !_.isFunction(item.forEachParent)) {
		return;
	}

	var chain = [];

	item.forEachParent(function (parent) {
		chain.unshift(parent.name || parent.id);
	});

	return chain.join(_.isString(separator) ? separator : SEPARATOR);
}

/**
 * A function that creates raw XML to be written to Newman JUnit reports.
 *
 * @param {Object} newman - The collection run object, with a event handler setter, used to enable event wise reporting.
 * @param {Object} reporterOptions - A set of JUnit reporter run options.
 * @param {String=} reporterOptions.export - Optional custom path to create the XML report at.
 * @returns {*}
 */
/**
 * NS Change
 * Earlier the below JunitFullReporter is as below 
 * JunitFullReporter = function (newman, reporterOptions, options) {
 */
JunitFullReporter = function (newman, reporterOptions) {

	newman.on('beforeDone', function () {
		var executions = _.get(newman, 'summary.run.executions');

		var date = moment(new Date()).local().format('YYYY-MM-DDTHH:mm:ss.SSS');

		if (!executions) {
			return;
		}

		root = xml.create('testsuites', { version: '1.0', encoding: 'UTF-8' });

		let executionRefs = new Set(executions.map((execution) => execution.cursor.ref));

		for (let ref of executionRefs) {
			let executionsForKey = executions.filter((execution) => execution.cursor.ref == ref);
			for (let execution of executionsForKey) {
				var testsuite = root.ele('testsuite'), failures = 0, errors = 0;
				testsuite.att('id', (execution.cursor.iteration * execution.cursor.length) + execution.cursor.position);
				testsuite.att('package', getParentName(execution.item));
				testsuite.att('name', execution.item.name);

				if (execution.assertions) {
					testsuite.att('tests', execution.assertions.length);
				}
				else {
					testsuite.att('tests', 0);
				}

				testsuite.att('timestamp', date);
				testsuite.att('time', (_.get(execution, 'response.responseTime') / 1000 || 0).toFixed(3));
				date = moment(date).add(_.get(execution, 'response.responseTime'), 'ms').local().format('YYYY-MM-DDTHH:mm:ss.SSS');

				_.forEach(['assertions'], function (property) {
					_.forEach(execution[property], function (testExecution) {
						var testcase = testsuite.ele('testcase');

						// Classname
						var className = [];
						className.push(_.get(testcase.up(), 'attributes.package.value'));
						className.push(_.get(testcase.up(), 'attributes.name.value'));
						testcase.att('classname', className.join(SEPARATOR));

						if (property === 'assertions') {
							// Name
							testcase.att('name', testExecution.assertion);

							// Time (testsuite time divided by number of assertions)
							testcase.att('time', (_.get(testcase.up(), 'attributes.time.value') / execution.assertions.length || 0).toFixed(3));

						} else {
							// Name
							testcase.att('name', property === 'testScript' ? 'Tests' : 'Pre-request Script');
						}

						// Errors / Failures
						var errorItem = testExecution.error;
						if (errorItem) {
							var result;
							if (property !== 'assertions') {
								// Error
								++errors;
								result = testcase.ele('error');

								if (errorItem.stacktrace) {
									result.dat(errorItem.stacktrace);
								}
							} else {
								// Failure
								++failures;
								result = testcase.ele('failure');
								result.dat(errorItem.stack);
							}

							result.att('type', errorItem.name);
							result.att('message', errorItem.message);
						}
					});
				});
			break;
			}
		}

		newman.exports.push({
			name: 'junit-reporter-full',
			default: 'newman-run-report-full.xml',
			path: reporterOptions.export,
			content: root.end({
				pretty: true,
				indent: '  ',
				newline: '\n',
				allowEmpty: false
			})
		});
	});
};

module.exports = JunitFullReporter;