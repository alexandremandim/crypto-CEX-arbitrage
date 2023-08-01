import { createClient } from 'redis';
import _ from 'lodash';
import config from 'config';


const redisClient = createClient({ url: config.get('redis.url') });

redisClient.connect();

export { redisClient };
