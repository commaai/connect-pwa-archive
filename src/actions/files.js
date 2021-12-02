import * as Sentry from '@sentry/react';
import { raw as RawApi, athena as AthenaApi } from '@commaai/comma-api';

import * as Types from './types';

const demoLogUrls = require('../demo/logUrls.json');
const demoFiles = require('../demo/files.json');

const FILE_NAMES = {
  'qcameras': 'qcamera.ts',
  'cameras': 'fcamera.hevc',
  'dcameras': 'dcamera.hevc',
  'ecameras': 'ecamera.hevc',
  'qlogs': 'qlog.bz2',
  'logs': 'rlog.bz2',
};
const MAX_OPEN_REQUESTS = 15;
const MAX_RETRIES = 5;

let openRequests = 0;

async function athenaCall(dongleId, payload, sentry_fingerprint, retryCount = 0) {
  try {
    while (openRequests > MAX_OPEN_REQUESTS) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
    openRequests += 1;
    const resp = await AthenaApi.postJsonRpcPayload(dongleId, payload);
    openRequests -= 1;
    return resp;
  } catch(err) {
    openRequests -= 1;
    if (!err.resp && retryCount < MAX_RETRIES) {
      setTimeout(() => athenaCall(dongleId, payload, sentry_fingerprint, retryCount + 1), 2000);
    }
    if (!err.message || err.message.indexOf('Device not registered') === -1) {
      console.log(err);
      Sentry.captureException(err, { fingerprint: sentry_fingerprint });
    }
    return { error: err.message };
  }
}

export function fetchFiles(routeName, nocache=false) {
  return async (dispatch, getState) => {
    let files;
    if (Object.keys(demoLogUrls).includes(routeName)) {
      files = demoFiles;
    } else {
      try {
        files = await RawApi.getRouteFiles(routeName, nocache);
      } catch (err) {
        console.log(err);
        Sentry.captureException(err, { fingerprint: 'action_files_fetch_files' });
        return;
      }
    }

    const dongleId = routeName.split('|')[0];
    const urlName = routeName.replace('|', '/');
    const res = {};
    for (const type of Object.keys(FILE_NAMES)) {
      for (const file of files[type]) {
        const segmentNum = parseInt(file.split(urlName)[1].split('/')[1]);
        const fileName = `${routeName}--${segmentNum}/${type}`;
        res[fileName] = {
          url: file,
        };
      }
    }

    dispatch({
      type: Types.ACTION_FILES_URLS,
      dongleId,
      urls: res,
    });
  };
}

export function fetchUploadQueue(dongleId) {
  return async (dispatch, getState) => {
    const { filesUploading } = getState();
    const payload = {
      method: 'listUploadQueue',
      jsonrpc: '2.0',
      id: 0,
    };
    const uploadQueue = await athenaCall(dongleId, payload, 'action_files_athena_uploadqueue');
    if (!uploadQueue || !uploadQueue.result) {
      return;
    }

    let prevFilesUploading = filesUploading || {};
    const uploadingFiles = {};
    const newCurrentUploading = {};
    for (const uploading of uploadQueue.result) {
      const urlParts = uploading.url.split('?')[0].split('/');
      const filename = urlParts[urlParts.length - 1];
      const segNum = urlParts[urlParts.length - 2];
      const datetime = urlParts[urlParts.length - 3];
      const dongleId = urlParts[urlParts.length - 4];
      const type = Object.entries(FILE_NAMES).find((e) => e[1] == filename)[0];
      const fileName = `${dongleId}|${datetime}--${segNum}/${type}`;
      uploadingFiles[fileName] = {
        current: uploading.current,
        progress: uploading.progress,
      };
      newCurrentUploading[uploading.id] = {
        fileName,
        current: uploading.current,
        progress: uploading.progress,
        createdAt: uploading.created_at,
      };
      delete prevFilesUploading[uploading.id];
    }
    if (getState().dongleId === dongleId && Object.keys(prevFilesUploading).length) { // some item is done uploading
      const routeName = Object.values(prevFilesUploading)[0].fileName.split('--').slice(0, 2).join('--');
      dispatch(fetchFiles(routeName, true));
    }
    dispatch({
      type: Types.ACTION_FILES_UPLOADING,
      dongleId,
      uploading: newCurrentUploading,
      files: uploadingFiles,
    });
  };
}

export function updateFiles(files) {
  return async (dispatch, getState) => {
    const { dongleId } = getState();
    dispatch({
      type: Types.ACTION_FILES_UPDATE,
      dongleId,
      files,
    });
  };
}

export function cancelUpload(id) {
  return async (dispatch, getState) => {
    const { dongleId, filesUploading } = getState();

    const fileName = filesUploading[id].fileName;
    const payload = {
      id: 0,
      jsonrpc: "2.0",
      method: "cancelUpload",
      params: { upload_id: id },
    };
    const resp = await athenaCall(dongleId, payload, 'action_files_athena_cancelupload');
    if (resp.result && resp.result.success) {
      dispatch({
        type: Types.ACTION_FILES_CANCELLED_UPLOAD,
        dongleId,
        id,
        fileName,
      });
    }
  };
}
