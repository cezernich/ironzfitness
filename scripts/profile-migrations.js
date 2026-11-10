'use strict';
const fs = require('node:fs');
const path = require('node:path');
// CLI2.84 discovery: lexically ordered directory entries, numeric version prefix.
function profileMigrations(directory) {
  return fs.readdirSync(directory).sort()
    .filter(name => /^\d+_(?:secure_profiles|restrict_coach_profile_reads|enforce_final_profile_privacy)\.sql$/.test(name))
    .map(name => path.join(directory,name));
}
if (require.main === module) {
  profileMigrations(path.resolve(__dirname,'../supabase/migrations')).forEach(file => console.log(file));
}
module.exports = { profileMigrations };
