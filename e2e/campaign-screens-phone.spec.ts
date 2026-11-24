import { campaignActSuite } from './campaignActs';
import { campaignScreenSuite, campaignScreenshotSuite } from './campaignScreens';

campaignScreenSuite(true);
campaignScreenshotSuite(true);

campaignActSuite(true, true);
