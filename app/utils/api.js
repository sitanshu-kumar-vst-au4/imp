/* eslint-disable no-unused-vars */
/* eslint-disable no-alert */
/* eslint-disable no-underscore-dangle */
/* eslint-disable prettier/prettier */
import Promise from 'bluebird';
import { useHistory } from 'react-router-dom';
import { getConfiguration, setConfiguration } from './configuration';

import {
  clearUserId,
  getAuthenticationToken,
  clearAuthenticationToken
} from './authentication';

// import axios from 'axios';

const EventEmitter = require('event-emitter');

const TIMEOUT = 60000 * 60;
setConfiguration('API_ROOT', 'http://3.7.9.147:7077');


/**
 * All HTTP errors are emitted on this channel for interested listeners
 */
export const errors = new EventEmitter();

/**
 * GET a path relative to API root url.
 * @param {String}  path Relative path to the configured API endpoint
 * @param {Boolean} suppressRedBox If true, no warning is shown on failed request
 * @returns {Promise} of response body
 */
export async function get(path, suppressRedBox) {
  return bodyOf(request('get', path, null, suppressRedBox));
}

/**
 * POST JSON to a path relative to API root url
 * @param {String} path Relative path to the configured API endpoint
 * @param {Object} body Anything that you can pass to JSON.stringify
 * @param {Boolean} suppressRedBox If true, no warning is shown on failed request
 * @returns {Promise}  of response body
 */
export async function post(path, body, suppressRedBox) {
  return bodyOf(request('post', path, body, suppressRedBox));
}

/**
 * PUT JSON to a path relative to API root url
 * @param {String} path Relative path to the configured API endpoint
 * @param {Object} body Anything that you can pass to JSON.stringify
 * @param {Boolean} suppressRedBox If true, no warning is shown on failed request
 * @returns {Promise}  of response body
 */
export async function put(path, body, suppressRedBox) {
  return bodyOf(request('put', path, body, suppressRedBox));
}

/**
 * DELETE a path relative to API root url
 * @param {String} path Relative path to the configured API endpoint
 * @param {Boolean} suppressRedBox If true, no warning is shown on failed request
 * @returns {Promise}  of response body
 */
export async function del(path, suppressRedBox) {
  return bodyOf(request('delete', path, null, suppressRedBox));
}

/**
 * Make arbitrary fetch request to a path relative to API root url
 * @param {String} method One of: get|post|put|delete
 * @param {String} path Relative path to the configured API endpoint
 * @param {Object} body Anything that you can pass to JSON.stringify
 * @param {Boolean} suppressRedBox If true, no warning is shown on failed request
 */
export async function request(method, path, body, suppressRedBox) {
  return new Promise(resolve => {
    sendRequest(method, path, body)
      .then(async response => {
        const data = await getSuccessData(response, suppressRedBox);
        if (data && data.statusCode >= 400) {
          resolve([data]);
        } else {
          resolve([null, data]);
        }
      })
      .catch(error => {
        if (!suppressRedBox) {
          logError(error, url(path), method);
        }
        resolve([error]);
      });
  });
}

export async function upload(method, path, body, suppressRedBox) {
  return new Promise(resolve => {
    sendRequest(method, path, body, true)
      .then(async response => {
        const data = await getSuccessData(response);
        resolve([null, data]);
      })
      .catch(error => {
        if (!suppressRedBox) {
          logError(error, url(path), method);
        }
        resolve([error]);
      });
  });
}
/**
 * Takes a relative path and makes it a full URL to API server
 */
export function url(path) {
  const apiRoot = getConfiguration('API_ROOT');
  return path.indexOf('/') === 0 ? apiRoot + path : `${apiRoot}/${path}`;
}

/**
 * Constructs and fires a HTTP request
 */
async function sendRequest(method, path, body, multipart) {
  try {
    const endpoint = url(path);
    const token = await getAuthenticationToken();
    const headers = getRequestHeaders(body, token, multipart);
    const options = body
      ? {
        method,
        headers,
        body: multipart ? body : JSON.stringify(body),
        timeout: multipart ? TIMEOUT : TIMEOUT,
      }
      : { method, headers };

    return timeout(fetch(endpoint, options), TIMEOUT);
  } catch (e) {
    throw new Error(e);
  }
}

function getRequestHeaders(body, token, multipart) {
  const headers = body
    ? { Accept: 'application/json', 'Content-Type': 'application/json' }
    : { Accept: 'application/json' };

  if (multipart && token) {
    return {
      Accept: 'application/json',
      Authorization: `bearer ${token}`,
      // 'content-type': 'multipart/form-data',
    };
  }
  if (token) {
    return { ...headers, Authorization: `bearer ${token}` };
  }
  return headers;
}

// try to get the best possible error message out of a response
// without throwing errors while parsing
async function getErrorMessageSafely(response) {
  try {
    const body = await response.text();
    if (!body) {
      return '';
    }

    // Optimal case is JSON with a defined message property
    const payload = JSON.parse(body);
    if (payload && payload.message) {
      return payload.message;
    }

    // Should that fail, return the whole response body as text
    return body;
  } catch (e) {
    // Unreadable body, return whatever the server returned
    return response._bodyInit;
  }
}

// handle success response
async function getSuccessData(response, suppressRedBox) {
  try {
    const body = await response.text();
    if (!body) {
      return '';
    }

    const payload = JSON.parse(body);
    if (payload && payload.error) {
      if (payload.error) {
        if (payload.statusCode === 401) {
          clearAuthenticationToken();
          clearUserId();
          // history.push('/');
          return '';
        }
      }
      return payload;
    }
    return payload;
  } catch (e) {
    return response._bodyInit;
  }
}

/**
 * Rejects a promise after `ms` number of milliseconds, it is still pending
 */
function timeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    promise
      .then(response => {
        clearTimeout(timer);
        resolve(response);
      })
      .catch(error => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

async function bodyOf(requestPromise) {
  try {
    const response = await requestPromise;
    return response.body;
  } catch (e) {
    throw e;
  }
}

/**
 * Make best effort to turn a HTTP error or a runtime exception to meaningful error log message
 */
function logError(error, endpoint, method) {
  if (error.status) {
    const summary = `(${error.status} ${error.statusText}): ${error._bodyInit}`;
    console.error(
      `API request ${method.toUpperCase()} ${endpoint} responded with ${summary}`,
    );
  } else {
    console.error(
      `API request ${method.toUpperCase()} ${endpoint} failed with message "${
        error.message
      }"`,
    );
  }
}
