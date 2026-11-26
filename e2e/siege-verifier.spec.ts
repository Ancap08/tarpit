import { siegeVerifierCases } from './siege-verifier-cases';
import { test } from '@playwright/test';

siegeVerifierCases(false, [undefined]);
test.describe('new interface', () => siegeVerifierCases(false, [undefined], true));
