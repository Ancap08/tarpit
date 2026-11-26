import { siegeVerifierCases } from './siege-verifier-cases';
import { test } from '@playwright/test';

siegeVerifierCases(true, [undefined]);
test.describe('new interface', () => siegeVerifierCases(true, [undefined], true));
