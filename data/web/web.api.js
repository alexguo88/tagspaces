/* Copyright (c) 2012-2013 The TagSpaces Authors. All rights reserved.
 * Use of this source code is governed by a AGPL3 license that
 * can be found in the LICENSE file. */
define(function(require, exports, module) {
  "use strict";

  // Activating browser specific exports modul
  console.log("Loading web.js..");

  var TSCORE = require("tscore");
  var TSPOSTIO = require("tspostioapi");

  require("webdavlib/webdavlib");

  var davClient;
  //exact copy of getAjax with timeout added 
  nl.sara.webdav.Client.prototype.getAjax = function(method, url, callback, headers) {
    var /** @type XMLHttpRequest */ ajax = (((typeof Components !== 'undefined') && (typeof Components.classes !== 'undefined')) ? Components.classes["@mozilla.org/xmlextras/xmlhttprequest;1"].createInstance(Components.interfaces.nsIXMLHttpRequest) : new XMLHttpRequest());
    if (this._username !== null) {
      ajax.open(method, url, true, this._username, this._password);
    } else {
      ajax.open(method, url, true);
    }
    ajax.onreadystatechange = function() {
      nl.sara.webdav.Client.ajaxHandler(ajax, callback);
    };
    
    ajax.ontimeout = function() {
      ajax.readyState = 4;
      ajax.ajax.status = -1;
      nl.sara.webdav.Client.ajaxHandler(ajax, callback);
    };

    if (headers === undefined) {
      headers = {};
    }
    for (var header in this._headers) {
      if (headers[header] === undefined) {
        ajax.setRequestHeader(header, this._headers[header]);
      }
    }
    for (var header in headers) {
      ajax.setRequestHeader(header, headers[header]);
    }
    return ajax;
  };

  function connectDav() {
    console.log("Connecting webdav...");
    var useHTTPS = false;
    if (location.href.indexOf("https") === 0) {
      useHTTPS = true;
    }
    davClient = new nl.sara.webdav.Client(location.hostname, useHTTPS, location.port);
  }

  //window.setTimeout(
  connectDav();
  //, 2000);

  function getNameForPath(path) {
    if (path.lastIndexOf("/") == path.length - 1) {
      path = path.substring(0, path.lastIndexOf("/"));
    }
    var encodedName = path.substring(path.lastIndexOf("/") + 1, path.length);
    return decodeURI(encodedName);
  }

  function isDirectory(path) {
    // TODO find a better solution
    return path.lastIndexOf("/") == path.length - 1;
  }

  function checkStatusCode(code) {
    var status = parseInt(code / 100);
    if (status === 2) {
      return true;
    }
    return false;
  }


  function focusWindow() {
    // Bring the TagSpaces window on top of the windows
    window.focus();
  }

  function checkNewVersion() {
    //
    console.log("Checking for new version not relevant fot the webdav version");
  }


  function createDirectoryTree(dirPath) {
    console.log("Creating directory index for: " + dirPath);
    TSCORE.showLoadingAnimation();

    var directoyTree = [];
    //console.log(JSON.stringify(directoyTree));
    TSPOSTIO.createDirectoryTree(directoyTree);
  }

  function listDirectoryPromise(dirPath) {
    dirPath = dirPath.split("//").join("/");
    console.log("Listing directory: " + dirPath);
    return new Promise(function(resolve, reject) {
      var anotatedDirList;

      var davSuccess = function(status, data) {
        console.log("Dirlist Status:  " + status);
        if (!checkStatusCode(status)) {
          console.warn("Listing directory " + dirPath + " failed " + status);
          reject("Listing directory " + dirPath + " failed " + status);
        }
        var dirList = data._responses, fileName, isDir, filesize, lmdt, path;

        anotatedDirList = [];
        for (var entry in dirList) {
          path = dirList[entry].href;
          console.log("---dP" + dirPath.toLowerCase());
          console.log("---p" + path.toLowerCase());
          if (dirPath.toLowerCase() === path.toLowerCase()) {
            console.log("Skipping current folder");
          } else {
            isDir = false;
            filesize = undefined;
            lmdt = undefined;
            //console.log(dirList[entry]._namespaces["DAV:"]);
            if (typeof dirList[entry]._namespaces["DAV:"].getcontentlength === 'undefined' ||
              dirList[entry]._namespaces["DAV:"].getcontentlength._xmlvalue.length === 0
            ) {
              isDir = true;
            } else {
              filesize = dirList[entry]._namespaces["DAV:"].getcontentlength._xmlvalue[0].data;
              lmdt = data._responses[entry]._namespaces["DAV:"].getlastmodified._xmlvalue[0].data;
            }
            fileName = getNameForPath(path);
            anotatedDirList.push({
              "name": fileName,
              "isFile": !isDir,
              "size": filesize,
              "lmdt": lmdt,
              "path": decodeURI(path)
            });
          }
        }
        resolve(anotatedDirList);
      };

      if (dirPath.substring(dirPath.length - 1) !== "/") {
        dirPath = dirPath + "/";
      }
      dirPath = encodeURI(dirPath);

      davClient.propfind(
        dirPath,
        davSuccess,
        1 //1 , davClient.INFINITY
      );
    });
  }


  function getPropertiesPromise(filePath) {
    return new Promise(function(resolve, reject) {
      davClient.propfind(encodeURI(filePath), function(status, data) {
        console.log("Properties Status / Content: " + status + " / " + JSON.stringify(data._responses));
        var fileProperties = {};
        if (checkStatusCode(status)) {
          for (var entry in data._responses) {
            fileProperties.path = filePath;
            fileProperties.size = data._responses[entry]._namespaces["DAV:"].getcontentlength;
            fileProperties.lmdt = data._responses[entry]._namespaces["DAV:"].getlastmodified._xmlvalue[0].data;
          }
          resolve(fileProperties);
        } else {
          reject("getFileProperties " + filePath + " failed " + status);
        }
      }, 1);
    });
  }

  function loadTextFilePromise(filePath) {
    //
    return getFileContentPromise(filePath, "text");
  }

  function getFileContentPromise(filePath, type) {
    console.log("getFileContent file: " + filePath);
    return new Promise(function(resolve, reject) {
      var ajax = davClient.getAjax("GET", filePath);
      ajax.onreadystatechange = null;
      ajax.responseType = type || "arraybuffer";
      ajax.onerror = reject;

      ajax.onload = function() {
        var response = ajax.response || ajax.responseText;
        if (checkStatusCode(ajax.status)) {
          resolve(response);
        } else {
          reject("getFileContentPromise ajax error");
        }
      };
      ajax.send();
    });
  }


  function saveFilePromise(filePath, content, overWrite, mode) {
    return new Promise(function(resolve, reject) {
      var isNewFile = false;
      davClient.propfind(encodeURI(filePath), function(status, data) {
        console.log("Check file exists: Status / Content: " + status + " / " + data);
        if (parseInt(status) === 404) {
          isNewFile = true;
        }
        if (isNewFile || overWrite === true || mode === "text") {
          davClient.put(
            encodeURI(filePath),
            function(status, data, headers) {
              console.log("Creating File Status/Content/Headers:  " + status + " / " + data + " / " + headers);
              if (checkStatusCode(status)) {
                resolve(isNewFile);
              } else {
                reject("saveFilePromise: " + filePath + " failed " + status);
              }
            },
            content,
            'application/octet-stream'
          );
        } else {
          reject("File Already Exists.");
        }
      }, 1);
    });
  }

  function saveTextFilePromise(filePath, content, overWrite) {
    console.log("Saving text file: " + filePath);
    return saveFilePromise(filePath, content, overWrite, "text");
  }

  function saveBinaryFilePromise(filePath, content, overWrite) {
    console.log("Saving binary file: " + filePath);
    return saveFilePromise(filePath, content, overWrite);
  }


  function createDirectoryPromise(dirPath) {
    console.log("Creating directory: " + dirPath);
    return new Promise(function(resolve, reject) {
      davClient.mkcol(
        encodeURI(dirPath),
        function(status, data, headers) {
          console.log("Directory Creation Status/Content/Headers:  " + status + " / " + data + " / " + headers);
          if (checkStatusCode(status)) {
            resolve(dirPath);
          } else {
            reject("createDirectory " + dirPath + " failed " + status);
          }
        }
      );
    });
  }


  function copyFilePromise(filePath, newFilePath) {
    console.log("Copying file: " + filePath + " to " + newFilePath);
    return new Promise(function(resolve, reject) {
      if (filePath.toLowerCase() === newFilePath.toLowerCase()) {
        TSCORE.hideWaitingDialog();
        TSCORE.showAlertDialog($.i18n.t("ns.common:fileTheSame"), $.i18n.t("ns.common:fileNotCopyied"));
        reject($.i18n.t("ns.common:fileTheSame"));
      } else {
        davClient.copy(
          encodeURI(filePath),
          function(status, data, headers) {
            console.log("Copy File Status/Content/Headers:  " + status + " / " + data + " / " + headers);
            if (checkStatusCode(status)) {
              resolve(filePath, newFilePath);
            } else {
              reject("copyFile " + filePath + " failed " + status);
            }
          },
          encodeURI(newFilePath),
          davClient.FAIL_ON_OVERWRITE
        );
      }
    });
  }

  function renameFilePromise(filePath, newFilePath) {
    console.log("Renaming file: " + filePath + " to " + newFilePath);
    return new Promise(function(resolve, reject) {
      if (filePath === newFilePath) {
        TSCORE.hideWaitingDialog();
        TSCORE.showAlertDialog($.i18n.t("ns.common:fileTheSame"), $.i18n.t("ns.common:fileNotMoved"));
        reject($.i18n.t("ns.common:fileTheSame"));
      } else {
        davClient.move(
          encodeURI(filePath),
          function(status, data, headers) {
            console.log("Rename File Status/Content/Headers:  " + status + " / " + data + " / " + headers);
            if (checkStatusCode(status)) {
              resolve([filePath, newFilePath]);
            } else {
              reject("rename: " + filePath + " failed " + status);
            }
          },
          encodeURI(newFilePath),
          davClient.FAIL_ON_OVERWRITE
        );
      }
    });
  }

  function renameDirectoryPromise(dirPath, newDirPath) {
    console.log("Renaming directory: " + dirPath + " to " + newDirPath);
    return new Promise(function(resolve, reject) {
      if (dirPath === newDirPath) {
        TSCORE.hideWaitingDialog();
        TSCORE.showAlertDialog($.i18n.t("ns.common:fileTheSame"), $.i18n.t("ns.common:fileNotMoved"));
        reject($.i18n.t("ns.common:fileTheSame"));
      } else {
        davClient.move(
          encodeURI(dirPath),
          function(status, data, headers) {
            console.log("Rename Directory Status/Content/Headers:  " + status + " / " + data + " / " + headers);
            if (checkStatusCode(status)) {
              resolve([dirPath, newDirPath]);
            } else {
              reject("rename: " + dirPath + " failed " + status);
            }
          },
          encodeURI(newDirPath),
          davClient.FAIL_ON_OVERWRITE
        );
      }
    });
  }


  function deleteFilePromise(path) {
    //
    return deleteDirectoryPromise(path);
  }

  function deleteDirectoryPromise(path) {
    return new Promise(function(resolve, reject) {
      davClient.remove(
        encodeURI(path),
        function(status, data, headers) {
          console.log("Directory/File Deletion Status/Content/Headers:  " + status + " / " + data + " / " + headers);
          if (checkStatusCode(status)) { 
            resolve(path);
          } else {
            reject("delete " + path + " failed " + status);
          }
        }
      );
    });
  }


  function selectDirectory() {
    //
    TSCORE.showAlertDialog("Select directory is still not implemented in the webdav edition");
  }

  function selectFile() {
    //
    TSCORE.showAlertDialog("selectFile not relevant for webdav");
  }


  function openDirectory(dirPath) {
    //
    TSCORE.showAlertDialog("openDirectory not relevant for webdav.");
  }

  function openFile(filePath) {
    //
    TSCORE.showAlertDialog("openFile not relevant for webdav");
  }

  // Platform API
  exports.focusWindow = focusWindow;
  exports.checkNewVersion = checkNewVersion;

  exports.createDirectoryTree = createDirectoryTree;

  exports.listDirectoryPromise = listDirectoryPromise;

  exports.getPropertiesPromise = getPropertiesPromise;

  exports.loadTextFilePromise = loadTextFilePromise;
  exports.getFileContentPromise = getFileContentPromise;

  exports.saveFilePromise = saveFilePromise;
  exports.saveTextFilePromise = saveTextFilePromise;
  exports.saveBinaryFilePromise = saveBinaryFilePromise;

  exports.createDirectoryPromise = createDirectoryPromise;

  exports.copyFilePromise = copyFilePromise;
  exports.renameFilePromise = renameFilePromise;
  exports.renameDirectoryPromise = renameDirectoryPromise;

  exports.deleteFilePromise = deleteFilePromise;
  exports.deleteDirectoryPromise = deleteDirectoryPromise;

  exports.selectDirectory = selectDirectory;
  exports.selectFile = selectFile;

  exports.openDirectory = openDirectory;
  exports.openFile = openFile;
});
