// Escuchador eliminado - se usa vigilante por snapshot desde layout.ejs
// Este archivo se mantiene vacío para que server.js no falle al requerirlo
module.exports = { getStatus: function() { return 'removed'; }, getQR: function() { return null; }, onQR: function() {}, reset: function() {} };
