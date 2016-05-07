var path = require('path');
var amdDeploy = require('amd-deploy');
var filePathToResourceId = require('amd-deploy/lib/filePathToResourceId');
var resourceIdToFilePath = require('amd-deploy/lib/resourceIdToFilePath');

var html2js = require('html2js');

var Node = require('fe-tree/lib/Node');
var feTree = require('fe-tree');
var feTreeUtil = require('fe-tree/lib/util');

var config = require('../config');

var html = require('./html');
var css = require('./css');
var less = require('./less');
var stylus = require('./stylus');
var script = require('./script');

exports.extnames = [
    '.js'
];

exports.is = function (node) {
    if (exports.extnames.indexOf(node.extname) >= 0) {
        var amdExcludes = config.amdExcludes;
        if (Array.isArray(amdExcludes)) {
            return !feTreeUtil.match(node.file, amdExcludes);
        }
        return true;
    }
};

var tplSuffix = '_html';
var styleSuffix = '_css';

function fileReader(node, suffix) {

    var sourceFile = node.file;
    var resourceId = filePathToResourceId(sourceFile, config.sourceAmdConfig)[0];
    resourceId = feTreeUtil.removeExtname(resourceId);

    var moduleId = resourceId + suffix;
    var outputFile = resourceIdToFilePath(moduleId, config.outputAmdConfig);

    var dependencyNode = feTree.dependencyMap[outputFile];
    if (dependencyNode) {
        return dependencyNode.content.toString();
    }

    var code = html2js(
        node.content.toString(),
        {
            mode: config.release ? 'compress' : undefined
        }
    );

    var content = 'define("'
        + moduleId
        + '", [], function () { return ' + code + '});';

    node = new Node(outputFile, new Buffer(content));
    node.buildContent = true;

    feTree.dependencyMap[outputFile] = node;

    return content;

}

function tplReader(node) {
    return fileReader(node, tplSuffix);
}

function styleReader(node) {
    return fileReader(node, styleSuffix);
}

function buildDependencyNode(node, build, dependencyMap, reverseDependencyMap) {
    var promise = node.buildContent;
    if (promise && promise.then) {
        return promise;
    }
    node.buildContent = function () {
        return build(this, dependencyMap, reverseDependencyMap);
    };
    return node.build();
}

exports.build = function (node, dependencyMap, reverseDependencyMap) {

    var amdConfig = feTreeUtil.extend({}, config.sourceAmdConfig);
    amdConfig.replaceRequireConfig = config.getOutputAmdConfig;
    amdConfig.replaceRequireResource = function (resource, absolute) {
        var raw = resource.id;
        var extname = path.extname(raw).toLowerCase();

        var isTpl = extname === '.html'
            || extname === '.tpl'

        var isStyle = extname === '.css'
            || extname === '.styl'
            || extname === '.less';

        var loadAsText = resource.plugin === 'text'
            || resource.plugin === 'html'
            || resource.plugin === 'tpl';

        if ((isTpl || isStyle) && loadAsText) {
            return {
                plugin: '',
                id: feTreeUtil.removeExtname(raw)
                    + (isTpl ? tplSuffix : styleSuffix)
            };
        }
    };
    amdConfig.fileReader = {
        js: function (file) {
            var node = dependencyMap[file];
            if (node) {
                if (node.buildContent !== true) {
                    return buildDependencyNode(
                        node,
                        exports.build,
                        dependencyMap,
                        reverseDependencyMap
                    )
                    .then(function () {
                        return node.content.toString();
                    });
                }
                return node.content.toString();
            }
        },
        css: function (file) {
            var node = dependencyMap[file];
            if (node) {
                if (node.buildContent !== true) {
                    return buildDependencyNode(
                        node,
                        css.build,
                        dependencyMap,
                        reverseDependencyMap
                    )
                    .then(function () {
                        return styleReader(node);
                    });
                }
                return styleReader(node);
            }
        },
        less: function (file) {
            var node = dependencyMap[file];
            if (node) {
                if (node.buildContent !== true) {
                    return buildDependencyNode(
                        node,
                        less.build,
                        dependencyMap,
                        reverseDependencyMap
                    )
                    .then(function () {
                        return styleReader(node);
                    });
                }
                return styleReader(node);
            }
        },
        styl: function (file) {
            var node = dependencyMap[file];
            if (node) {
                if (node.buildContent !== true) {
                    return buildDependencyNode(
                        node,
                        stylus.build,
                        dependencyMap,
                        reverseDependencyMap
                    )
                    .then(function () {
                        return styleReader(node);
                    });
                }
                return styleReader(node);
            }
        },
        html: function (file) {
            var node = dependencyMap[file];
            if (node) {
                if (node.buildContent !== true) {
                    return buildDependencyNode(
                        node,
                        html.build,
                        dependencyMap,
                        reverseDependencyMap
                    )
                    .then(function () {
                        return tplReader(node);
                    });
                }
                return tplReader(node);
            }
        },
        tpl: function (file) {
            var node = dependencyMap[file];
            if (node) {
                if (node.buildContent !== true) {
                    return buildDependencyNode(
                        node,
                        html.build,
                        dependencyMap,
                        reverseDependencyMap
                    )
                    .then(function () {
                        return tplReader(node);
                    });
                }
                return tplReader(node);
            }
        },
    };

    return new Promise(function (resolve, reject) {
        amdDeploy({
            file: node.file,
            content: node.content.toString(),
            config: amdConfig,
            callback: function (code) {
                node.content = config.release
                    ? script.uglify(code)
                    : code;
                resolve();
            }
        });
    });

};
