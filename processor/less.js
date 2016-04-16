var less = require('less');
var config = require('../config');

var css = require('./css');
var smarty = require('./smarty');
var html = require('./html');
var amd = require('./amd');

var extname = {
    '.less': 1
};

function isRootStyle(node, dependencyMap, reverseDependencyMap) {
    var files = reverseDependencyMap[node.file];
    return files
        && files.filter(
            function (file) {
                var node = dependencyMap[file];
                return smarty.is(node, dependencyMap, reverseDependencyMap)
                    || html.is(node, dependencyMap, reverseDependencyMap)
                    || amd.is(node, dependencyMap, reverseDependencyMap);
            }
        ).length > 0;
}

exports.is = function (node, dependencyMap, reverseDependencyMap) {
    if (extname[node.extname]) {
        return isRootStyle(node, dependencyMap, reverseDependencyMap);
    }
};

exports.filter = function (node, dependencyMap, reverseDependencyMap) {
    if (extname[node.extname]) {
        return !isRootStyle(node, dependencyMap, reverseDependencyMap);
    }
};

exports.build = function (node) {
    return new Promise(function (resolve, reject) {
        less.render(
            node.content.toString(),
            {
                filename: node.file,
                relativeUrls: true,
                compress: config.release
            },
            function (error, output) {
                if (error) {
                    console.error(error);
                }
                css
                .autoprefixer(output.css)
                .then(function (content) {
                    node.content = content;
                    resolve();
                });
            }
        );
    });
};


