import crypto from 'crypto';

export const generateDeterministicUuid = (input) => {
  const hash = crypto.createHash('md5').update(String(input)).digest('hex');
  return [
    hash.substring(0, 8),
    hash.substring(8, 12),
    '4' + hash.substring(13, 16),
    'a' + hash.substring(17, 20),
    hash.substring(20, 32)
  ].join('-');
};
