#!/usr/bin/env node
// set-access.js — manage cockpit logins. YOU type the password; it's scrypt-hashed and never
// stored or printed in plaintext. The app requires login as soon as one user exists.
//
//   node server/set-access.js <username>        add or change a user's password
//   node server/set-access.js --remove <user>   revoke one user
//   node server/set-access.js --list            list usernames (never passwords)
import { loadUsers, saveUsers, hashPassword } from './auth.js';

const args = process.argv.slice(2);

// masked prompt — shows the prompt text and one * per character typed, so you can SEE it
// registering. Handles Enter, backspace, and ctrl-C. Compares by char CODE so the source
// carries no raw control bytes. Falls back to a plain read on a non-TTY (piped) stdin.
function maskedPrompt(question) {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    process.stdout.write(question);
    if (!stdin.isTTY) {
      let buf = '';
      stdin.setEncoding('utf8');
      stdin.on('data', (d) => { buf += d; const i = buf.indexOf('\n'); if (i >= 0) { stdin.pause(); resolve(buf.slice(0, i)); } });
      return;
    }
    let input = '';
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    const done = (val) => { stdin.removeListener('data', onData); stdin.setRawMode(false); stdin.pause(); process.stdout.write('\n'); resolve(val); };
    const onData = (ch) => {
      const code = ch.charCodeAt(0);
      if (ch === '\r' || ch === '\n' || code === 4) return done(input);        // Enter / ctrl-D
      if (code === 3) { process.stdout.write('\n'); process.exit(1); }         // ctrl-C
      if (code === 8 || code === 127) { if (input.length) { input = input.slice(0, -1); process.stdout.write('\b \b'); } return; } // backspace
      if (code < 32) return;                                                          // ignore other control chars
      input += ch;
      process.stdout.write('*');
    };
    stdin.on('data', onData);
  });
}

async function setUser(name) {
  console.log(`\nSetting a password for "${name}".`);
  console.log("As you type you'll see one * per character (the password itself stays hidden).");
  console.log('Pick something at least 6 characters. Press Enter when done.\n');
  for (let attempt = 1; attempt <= 3; attempt++) {
    const pw = await maskedPrompt('  New password:  ');
    if (pw.length < 6) { console.log("  -> too short (need 6+). Let's try again.\n"); continue; }
    const pw2 = await maskedPrompt('  Type it again: ');
    if (pw !== pw2) { console.log("  -> the two didn't match. Let's try again.\n"); continue; }
    const users = loadUsers();
    const existed = !!users[name];
    users[name] = hashPassword(pw);
    saveUsers(users);
    console.log(`\n[ok] ${existed ? 'Updated' : 'Saved'} the password for "${name}". Login is now required.`);
    console.log(`     Sign in at your cockpit URL with username "${name}" and this password.`);
    return;
  }
  console.log("\nThree tries used — nothing saved. Re-run the command whenever you're ready.");
  process.exit(1);
}

async function main() {
  if (args[0] === '--list') {
    const users = Object.keys(loadUsers());
    console.log(users.length ? `users:\n  ${users.join('\n  ')}` : 'no users — the app is open (no login required)');
    return;
  }
  if (args[0] === '--remove') {
    const name = args[1];
    if (!name) { console.error('usage: --remove <username>'); process.exit(1); }
    const users = loadUsers();
    if (!users[name]) { console.error(`no such user: ${name}`); process.exit(1); }
    delete users[name];
    saveUsers(users);
    console.log(`removed ${name}. ${Object.keys(users).length === 0 ? 'No users left → the app is now OPEN (no login).' : `${Object.keys(users).length} user(s) remain.`}`);
    return;
  }
  const name = args[0];
  if (!name || name.startsWith('--')) {
    console.error('usage: node server/set-access.js <username>   (or --remove <user> / --list)');
    process.exit(1);
  }
  await setUser(name);
}
main();
