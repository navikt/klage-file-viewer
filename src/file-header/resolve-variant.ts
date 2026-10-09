import { type ResolvedVariant, VARIANT_FORMATS } from '@/file-header/variant-types';
import type { FileVariant, FileVariants, VariantFormat } from '@/types';

/** Formats to fall back to, in order, when the selected format is missing or inaccessible. */
const FALLBACK_ORDER: VariantFormat[] = ['SLADDET', 'ARKIV', 'FULLVERSJON'];

/** Collapse the {@link FileVariants} union into a single active variant. */
export const resolveVariantData = (
  variants: FileVariants,
  selectedFormat: VariantFormat,
  selectFormat: (format: VariantFormat) => void,
): ResolvedVariant => {
  if (typeof variants === 'string') {
    return {
      filtype: variants,
      hasAccess: true,
      format: 'ARKIV',
      skjerming: null,
      hasExplicitFormat: false,
      selectableFormats: [],
      selectFormat,
    };
  }

  const variantList: [FileVariant, ...FileVariant[]] = Array.isArray(variants) ? variants : [variants];

  return {
    ...getActiveVariant(variantList, selectedFormat),
    hasExplicitFormat: true,
    selectableFormats: VARIANT_FORMATS.filter((format) => findVariant(variantList, format)?.hasAccess === true),
    selectFormat,
  };
};

/** The first accessible variant in order of preference, or the first existing one if none are accessible. */
const getActiveVariant = (variants: [FileVariant, ...FileVariant[]], selectedFormat: VariantFormat): FileVariant => {
  const candidates = [selectedFormat, ...FALLBACK_ORDER]
    .map((format) => findVariant(variants, format))
    .filter((variant) => variant !== undefined);

  return candidates.find((variant) => variant.hasAccess) ?? candidates[0] ?? variants[0];
};

const findVariant = (variants: readonly FileVariant[], format: VariantFormat): FileVariant | undefined =>
  variants.find((variant) => variant.format === format);
