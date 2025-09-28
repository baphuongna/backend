import { Request } from 'express';
import { User } from './user.js';

declare global {
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}