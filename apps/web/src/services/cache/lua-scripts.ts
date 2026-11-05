export const INCR_EXPIRE = `
local n = redis.call('INCR', KEYS[1])
if n == 1 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
end
return n
`;

export const HSET_EXPIRE = `
redis.call('HSET', KEYS[1], ARGV[1], ARGV[2])
if redis.call('TTL', KEYS[1]) < 0 then
  redis.call('EXPIRE', KEYS[1], ARGV[3])
end
return 1
`;
