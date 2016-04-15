var extname = {
    '.jpg': 1,
    '.jpeg': 1,
    '.png': 1,
    '.gif': 1,
    '.ico': 1
};

exports.is = function (node) {
    return extname[node.extname];
};

exports.build = function (node, map) {

};
