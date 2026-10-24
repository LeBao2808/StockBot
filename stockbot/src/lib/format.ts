export const money = (value: number) =>
  new Intl.NumberFormat("vi-VN").format(value) + " ₫";

export const dollars = (value: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    value,
  );
