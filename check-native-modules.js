'use strict';

// Probe only (no rebuild). Prefer scripts/ensure-native-modules.js before start.
const Database = require('better-sqlite3');
const db = new Database(':memory:');
db.close();
require('bcrypt');
