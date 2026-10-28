// i18n keys for the register's fixed words (asset types and conditions from utils/assetRules.ts,
// whose own labels are English with a Bengali copy and an emoji).
import { ASSET_CATEGORIES, type AssetCondition } from '../../utils/assetRules';
import type { I18nKey } from '../../utils/i18n';

export const conditionKey = (c: AssetCondition) => `assets.cond.${c}` as I18nKey;

export const assetCategoryKey = (key: string) => `assets.cat.${ASSET_CATEGORIES.some((c) => c.key === key) ? key : 'other'}` as I18nKey;
