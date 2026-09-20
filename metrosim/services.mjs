// Shared identities for platform boards and the actual vehicle destination signs.
export const OWN_SERVICE = Object.freeze({ line: 'U8', destination: 'Waldheim' });
export const OTHER_SERVICES = Object.freeze([
  Object.freeze({ line: 'U3', destination: 'Lindenau' }),
  Object.freeze({ line: 'U6', destination: 'Falkenried' }),
]);
export const precedingService = index => OTHER_SERVICES[Math.floor(index / 3) % OTHER_SERVICES.length];
export const serviceLabel = service => `${service.line}  ${service.destination}`;
