'use strict';

const RETIREMENT_CODE = 'ACCOUNT_LIFECYCLE_NOT_GOVERNED';

async function main() {
  const error = new Error(
    `${RETIREMENT_CODE}: el bootstrap con contraseñas está retirado hasta implementar invitación de un uso, MFA, sesiones revocables, doble aprobación y auditoría transaccional`,
  );
  error.code = RETIREMENT_CODE;
  throw error;
}

if (require.main === module) {
  main().catch(error => {
    console.error(`Bootstrap rechazado: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = Object.freeze({ main, RETIREMENT_CODE });
