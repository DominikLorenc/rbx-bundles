import { RunInput, FunctionResult, CartOperation } from "../generated/api";

const NO_CHANGES: FunctionResult = {
  operations: [],
};

export const run = (input: RunInput): FunctionResult => {
  // Group cart lines by bundle ID with relevant product details
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
    }[]
  > = {};

  input.cart.lines.forEach((line) => {
    const bundleID = line.bundleID?.value;
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
      });
    }
  });

  const createBundleOperation = (
    group: (typeof groupedItems)[string],
    discount: string | null
  ): CartOperation | undefined => {
    if (group.length > 0 && discount) {
      const productId = group[0].productId?.split("/").pop() ?? "";
      const variantIds = group.flatMap(({ variantId, quantity }) =>
        new Array(quantity).fill(variantId?.split("/").pop() ?? "")
      );

      const bundleId = group[0].bundleID ?? "";
      const cartMessage = group[0].cartMessage ?? "";

      return {
        merge: {
          cartLines: group.map(({ id, quantity }) => ({
            cartLineId: id,
            quantity,
          })),
          parentVariantId: "gid://shopify/ProductVariant/43892934017146",
          price: {
            percentageDecrease: {
              value: discount,
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
            { key: "_bundleId", value: bundleId },
            { key: "_cartMessage", value: cartMessage },
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
