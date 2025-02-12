import { RunInput, FunctionResult, CartOperation } from "../generated/api";

const NO_CHANGES: FunctionResult = {
  operations: [],
};

export const run = (input: RunInput): FunctionResult => {
  const groupedItems: Record<
    string,
    {
      id: string;
      quantity: number;
      twoPackDiscount?: string | null;
      threePackDiscount?: string | null;
      variantId?: string;
      productId?: string;
      bundleID?: string;
      cartMessage?: string;
      discountValue?: string;
    }[]
  > = {};

  input.cart.lines.forEach((line) => {
    const bundleID = line.bundleID?.value;
    const discountValue = line.discountValue?.value;
    if (bundleID && "product" in line.merchandise) {
      const merchandise = line.merchandise;

      // Initialize array if it doesn't exist
      if (!groupedItems[bundleID]) {
        groupedItems[bundleID] = [];
      }

      groupedItems[bundleID].push({
        id: line.id,
        quantity: line.quantity,
        twoPackDiscount: merchandise.product.twoPackPrice?.value ?? null,
        threePackDiscount: merchandise.product.threePackPrice?.value ?? null,
        variantId: merchandise.id,
        productId: merchandise.product.id,
        bundleID,
        cartMessage: line.cartMessage?.value ?? "",
        discountValue: discountValue ?? "",
      });
    }
  });

  const extractDiscountFromString = (input: string): number => {
    const match = input.match(/\d+/g);
    if (match && match.length > 0) {
      const discount = parseInt(match[match.length - 1], 10);

      return discount <= 60 ? discount : 0;
    }
    return 0;
  };

  const createBundleOperation = (
    group: (typeof groupedItems)[string],
    discount: string | null,
  ): CartOperation | undefined => {
    if (group.length > 0 && discount) {
      const productId = group[0].productId?.split("/").pop() ?? "";
      const variantIds = group.flatMap(({ variantId, quantity }) =>
        new Array(quantity).fill(variantId?.split("/").pop() ?? "")
      );

      const bundleId = group[0].bundleID ?? "";
      const cartMessage = group[0].cartMessage ?? "";
      const discountValue = group[0].discountValue || "";

      const additionalDiscountValue = extractDiscountFromString(discountValue);

      const preparedAdditionalDiscountMessage =
        additionalDiscountValue > 0 ? `${additionalDiscountValue}% off` : "";

      const baseDiscount = parseFloat(discount);
      const combinedDiscount =
        !isNaN(baseDiscount) && additionalDiscountValue > 0
          ? 100 - ((100 - baseDiscount) * (100 - additionalDiscountValue)) / 100
          : baseDiscount;

      return {
        merge: {
          cartLines: group.map(({ id, quantity }) => ({
            cartLineId: id,
            quantity,
          })),
          parentVariantId: "gid://shopify/ProductVariant/43895533109370",
          price: {
            percentageDecrease: {
              value: combinedDiscount.toFixed(2),
            },
          },
          attributes: [
            {
              key: "_bundleMessage",
              value: `Bundle and save! - Save ${discount}% OFF`,
            },
            { key: "_variantId", value: JSON.stringify(variantIds) },
            { key: "_productId", value: productId },
            { key: "_discount", value: discount },
            { key: "_bundleID", value: bundleId },
            { key: "_cartMessage", value: cartMessage },
            { key: "_discountValue", value: discountValue },
            {
              key: "_additionalDiscountValue",
              value: preparedAdditionalDiscountMessage,
            },
          ],
        },
      };
    }
    return;
  };

  const operations: CartOperation[] = Object.values(groupedItems)
    .map((group) => {
      const groupTotalQuantity = group.reduce(
        (acc, { quantity }) => acc + quantity,
        0
      );

      if (groupTotalQuantity === 2) {
        return createBundleOperation(group, group[0].twoPackDiscount ?? "0");
      }

      if (groupTotalQuantity === 3) {
        return createBundleOperation(group, group[0].threePackDiscount ?? "0");
      }

      return;
    })
    .filter(Boolean) as CartOperation[];

  return operations.length ? { operations } : NO_CHANGES;
};
