"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  formatPurchaseCoreValue,
  getPurchaseCoreFieldLabel,
  getPurchaseCoreFields,
  type PurchaseCoreFields,
} from "@/lib/import/inbound-fields";
import type { InboundRecord } from "@/lib/types";

const CORE_KEYS: (keyof PurchaseCoreFields)[] = [
  "C_WB_No",
  "C_Veh_No",
  "C_Driver",
  "C_Settle_Weight",
  "C_Dry_Weight",
  "C_Percentage",
  "C_Base_Price",
  "Total_Amount",
  "C_Mat_Type",
];

export function PurchaseCoreFieldsCard({
  record,
  title = "采购单核心信息",
}: {
  record: InboundRecord;
  title?: string;
}) {
  const fields = getPurchaseCoreFields(record);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {CORE_KEYS.map((key) => (
          <div key={key} className="flex justify-between gap-4 text-sm">
            <span className="text-muted-foreground shrink-0">
              {getPurchaseCoreFieldLabel(key)}
            </span>
            <span
              className={`text-right tabular-nums ${
                key === "C_WB_No" ? "font-mono" : ""
              } ${key === "Total_Amount" ? "font-medium" : ""}`}
            >
              {key === "Total_Amount" && fields.Total_Amount > 0
                ? `¥${formatPurchaseCoreValue(key, fields)}`
                : formatPurchaseCoreValue(key, fields)}
            </span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
