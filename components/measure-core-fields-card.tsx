"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  formatMeasureCoreValue,
  getMeasureCoreFieldLabel,
  getMeasureCoreFields,
  type MeasureCoreFields,
} from "@/lib/import/measure-fields";
import type { MeasureTicket } from "@/lib/types";

const CORE_KEYS: (keyof MeasureCoreFields)[] = [
  "DATE",
  "J_WB_No",
  "J_Veh_No",
  "J_Driver",
  "J_N_Weight",
  "J_A_Weight",
  "J_Mat_Type",
];

export function MeasureCoreFieldsCard({
  ticket,
  title = "计量单核心信息",
}: {
  ticket: MeasureTicket;
  title?: string;
}) {
  const fields = getMeasureCoreFields(ticket);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {CORE_KEYS.map((key) => (
          <div key={key} className="flex justify-between gap-4 text-sm">
            <span className="text-muted-foreground shrink-0">
              {getMeasureCoreFieldLabel(key)}
            </span>
            <span
              className={`text-right tabular-nums ${
                key === "J_WB_No" ? "font-mono" : ""
              }`}
            >
              {formatMeasureCoreValue(key, fields)}
            </span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
