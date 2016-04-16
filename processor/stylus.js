var stylus = require('stylus');
var path = require('path');

var config = require('../config');
var page = require('./page');
var html = require('./html');
var css = require('./css');
var amd = require('./amd');

var extname = {
    '.styl': 1
};

function isRootStyle(node, dependencyMap, reverseDependencyMap) {
    var files = reverseDependencyMap[node.file];
    return files
        && files.filter(
            function (file) {
                var node = dependencyMap[file];
                return page.is(node, dependencyMap, reverseDependencyMap)
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
        stylus(
            node.content.toString()
        )
        .set('filename', node.file)
        .set('compress', config.release)
        .define('url', stylus.resolver({
            nocheck: true
        }))
        .render(function (error, output) {
            if (error) {
                console.error(error);
            }
            css
            .autoprefixer(output)
            .then(function (content) {
                node.content = content;
                resolve();
            });
        });
    });
};