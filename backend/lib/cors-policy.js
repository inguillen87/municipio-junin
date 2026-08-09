'use strict';

const {
  buildCorsOriginPolicy,
  isCorsOriginAllowed,
} = require('../../shared/cors-origin-policy.cjs');

function createCorsOptions(environment = process.env) {
  const policy = buildCorsOriginPolicy(environment);

  return {
    origin(origin, callback) {
      callback(null, isCorsOriginAllowed(origin, policy));
    },
    credentials: true,
  };
}

module.exports = Object.freeze({ createCorsOptions });
