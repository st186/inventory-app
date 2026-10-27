// i18n key for a stock item's unit (pieces, kg, liters, grams, ml).
import type { I18nKey } from '../../utils/i18n';

export const unitKey = (unit: string) => `items.unit.${unit}` as I18nKey;
