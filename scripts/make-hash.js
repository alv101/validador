const argon2 = require("argon2");

(async () => {
  const password = process.argv[2];
  if (!password) {
    console.error("Uso: node make-hash.js <password>");
    process.exit(1);
  }

  const hash = await argon2.hash(password);
  console.log(hash);
})();
