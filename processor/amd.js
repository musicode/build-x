var path = require('path');
var amdDeploy = require('amd-deploy');
var filePathToResourceId = require('amd-deploy/lib/filePathToResourceId');

var html2js = require('html2js');
var feTreeUtil = require('fe-tree/lib/util');

var config = require('../config');
var script = require('./script');

var extname = {
    '.js': 1
};

exports.is = function (node) {
    if (extname[node.extname]) {
        var amdExcludes = config.amdExcludes;
        if (Array.isArray(amdExcludes)) {
            return !feTreeUtil.match(node.file, amdExcludes);
        }
        return true;
    }
};

var tplSuffix = '_html';
var styleSuffix = '_css';

function tplReader(node) {

    var resourceId = filePathToResourceId(node.file, config.sourceAmdConfig)[0];
    resourceId = feTreeUtil.removeExtname(resourceId);

    var code = html2js(
        node.content.toString(),
        {
            mode: config.release ? 'compress' : undefined
        }
    );

    return 'define("'
        + resourceId
        + tplSuffix
        + '", [], function () { return ' + code + '});';

}

function styleReader(node) {

    var resourceId = filePathToResourceId(node.file, config.sourceAmdConfig)[0];
    resourceId = feTreeUtil.removeExtname(resourceId);

    var code = html2js(
        node.content.toString(),
        {
            mode: config.release ? 'compress' : undefined
        }
    );

    return 'define("'
        + resourceId
        + styleSuffix
        + '", [], function () { return ' + code + '});';

}

exports.build = function (node, dependencyMap) {

    var amdConfig = feTreeUtil.extend({}, config.sourceAmdConfig);
    amdConfig.replaceRequireConfig = config.getOutputAmdConfig;
    amdConfig.combine = {
        exclude: [
            'echarts',
            'echarts/**/*',
            'cobble',
            'cobble/**/*',
            'moment',
            'image-crop',
            'audioPlayer',
            'underscore',
            'TextClipboard',
            'common/store',
            'common/service'
        ]
    };
    amdConfig.fileReader = {
        js: function (file) {
            var node = dependencyMap[file];
            if (node) {
                var code = node.content.toString();
                return config.release
                    ? script.uglify(code)
                    : code;
            }
        },
        css: function (file) {
            var node = dependencyMap[file];
            if (node) {
                return styleReader(node);
            }
        },
        less: function (file) {
            var node = dependencyMap[file];
            if (node) {
                return styleReader(node);
            }
        },
        styl: function (file) {
            var node = dependencyMap[file];
            if (node) {
                return styleReader(node);
            }
        },
        html: function (file) {
            var node = dependencyMap[file];
            if (node) {
                return tplReader(node);
            }
        },
        tpl: function (file) {
            var node = dependencyMap[file];
            if (node) {
                return tplReader(node);
            }
        },
    };

    node.walk({
        htmlRules: config.htmlRules,
        amdExcludes: config.amdExcludes,
        amdConfig: config.sourceAmdConfig,
        processDependency: function (dependency, node) {
            var dependency = config.processDependency(dependency, node);
            if (!dependency) {
                return;
            }
            if (dependency.amd) {

                var raw = dependency.raw;
                var extname = path.extname(raw).toLowerCase();

                var isTpl = extname === '.html'
                    || extname === '.tpl';

                var isStyle = extname === '.css'
                    || extname === '.styl'
                    || extname === '.less';

                var loadAsText = dependency.plugin === 'text'
                    || dependency.plugin === 'html'
                    || dependency.plugin === 'tpl';

                if ((isTpl || isStyle) && loadAsText) {
                    dependency.plugin = '';
                    dependency.raw = feTreeUtil.removeExtname(raw)
                        + (isTpl ? tplSuffix : styleSuffix);
                }

            }
            return dependency;
        }
    });

    amdDeploy({
        file: node.file,
        content: node.content.toString(),
        config: amdConfig,
        minify: config.release,
        callback: function (code) {
            node.content = code;
        }
    });

};
