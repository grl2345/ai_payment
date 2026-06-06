"use client";

import { Header } from "@/components/header";
import { VehicleSettlementManager } from "@/components/vehicle-settlement-manager";

export default function SettingsPage() {
  return (
    <div className="flex flex-col h-full">
      <Header
        title="车辆结算档案"
        description="维护车牌、司机、扣留单价等；单据核对确认后用于自动生成付款明细"
        eyebrow="基础资料"
      />

      <div className="flex-1 overflow-auto p-3 sm:p-6">
        <VehicleSettlementManager />
      </div>
    </div>
  );
}
