import { SetMetadata } from '@nestjs/common';

/** Marks a route as not requiring authentication (e.g. login, health). */
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
