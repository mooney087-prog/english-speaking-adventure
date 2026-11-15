import {randomBytes} from 'node:crypto';
console.log('Keep these values private. Set them in Netlify environment variables.');
console.log('TEACHER_PASSWORD='+randomBytes(18).toString('base64url'));
console.log('SESSION_SECRET='+randomBytes(36).toString('base64url'));
