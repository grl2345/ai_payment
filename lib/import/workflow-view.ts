import type {
  InboundRecord,
  MeasureTicket,
  PaymentDetail,
  TicketMatch,
} from "@/lib/types";

export type WorkflowStepKey = "import" | "verify" | "payment";

export type WorkflowStepStatus = "done" | "active" | "error" | "pending";

export interface WorkflowStep {
  key: WorkflowStepKey;
  label: string;
  status: WorkflowStepStatus;
  summary: string;
  href: string;
}

export type WorkflowOverallStatus =
  | "completed"
  | "in_progress"
  | "blocked"
  | "pending";

export interface WorkflowItem {
  ticketNo: string;
  plateNo: string;
  driverName: string;
  supplierName: string;
  businessDate: string;
  overallStatus: WorkflowOverallStatus;
  overallLabel: string;
  steps: WorkflowStep[];
  measureId: string;
  matchId?: string;
  paymentId?: string;
}

function importStep(
  measure: MeasureTicket,
  inbound: InboundRecord | undefined
): WorkflowStep {
  if (measure.ocrStatus === "识别失败") {
    return {
      key: "import",
      label: "单据导入",
      status: "error",
      summary: "计量单识别失败",
      href: "/import",
    };
  }
  if (measure.ocrStatus === "待审核" || measure.ocrStatus === "待识别") {
    return {
      key: "import",
      label: "单据导入",
      status: "active",
      summary: `计量单${measure.ocrStatus}`,
      href: "/import",
    };
  }
  if (inbound && inbound.reviewStatus === "待审核") {
    return {
      key: "import",
      label: "单据导入",
      status: "active",
      summary: "入库单待审核",
      href: "/import",
    };
  }
  return {
    key: "import",
    label: "单据导入",
    status: "done",
    summary: inbound ? "计量+入库已审核" : "计量单已审核",
    href: "/import",
  };
}

function verifyStep(match: TicketMatch | undefined): WorkflowStep {
  if (!match) {
    return {
      key: "verify",
      label: "单据核对",
      status: "pending",
      summary: "待匹配入库",
      href: "/import?tab=passed",
    };
  }
  if (match.matchStatus === "已确认") {
    return {
      key: "verify",
      label: "单据核对",
      status: "done",
      summary: "已确认",
      href: "/import?tab=passed",
    };
  }
  if (match.matchStatus === "已作废") {
    return {
      key: "verify",
      label: "单据核对",
      status: "error",
      summary: "已作废",
      href: "/import?tab=passed",
    };
  }
  if (
    match.matchStatus === "核对异常" ||
    match.matchStatus === "疑似匹配" ||
    match.matchStatus === "待匹配"
  ) {
    return {
      key: "verify",
      label: "单据核对",
      status: "error",
      summary: match.matchStatus,
      href: "/import?tab=passed&status=exception",
    };
  }
  if (match.matchStatus === "匹配成功") {
    return {
      key: "verify",
      label: "单据核对",
      status: "active",
      summary: "匹配成功，待确认",
      href: "/import?tab=passed",
    };
  }
  return {
    key: "verify",
    label: "单据核对",
    status: "pending",
    summary: match.matchStatus,
    href: "/import?tab=passed",
  };
}

function paymentStep(
  match: TicketMatch | undefined,
  payment: PaymentDetail | undefined
): WorkflowStep {
  if (!match || match.matchStatus !== "已确认") {
    return {
      key: "payment",
      label: "付款明细",
      status: "pending",
      summary: "核对确认后生成",
      href: "/payment",
    };
  }
  if (!payment) {
    return {
      key: "payment",
      label: "付款明细",
      status: "active",
      summary: "待生成付款",
      href: "/payment",
    };
  }
  if (payment.paymentStatus === "已支付") {
    return {
      key: "payment",
      label: "付款明细",
      status: "done",
      summary: `已支付 ¥${payment.paidAmount.toFixed(2)}`,
      href: "/payment",
    };
  }
  if (payment.paymentStatus === "部分支付") {
    return {
      key: "payment",
      label: "付款明细",
      status: "active",
      summary: `部分支付 ¥${payment.paidAmount.toFixed(2)}`,
      href: "/payment",
    };
  }
  return {
    key: "payment",
    label: "付款明细",
    status: "active",
    summary: `${payment.paymentStatus} ¥${payment.payableAmount.toFixed(2)}`,
    href: "/payment",
  };
}

function overallFromSteps(steps: WorkflowStep[]): {
  status: WorkflowOverallStatus;
  label: string;
} {
  if (steps.some((s) => s.status === "error")) {
    return { status: "blocked", label: "需处理" };
  }
  if (steps.every((s) => s.status === "done")) {
    return { status: "completed", label: "已完成" };
  }
  if (steps.every((s) => s.status === "pending")) {
    return { status: "pending", label: "未开始" };
  }
  return { status: "in_progress", label: "进行中" };
}

export function buildWorkflowItems(input: {
  measureTickets: MeasureTicket[];
  inboundRecords: InboundRecord[];
  ticketMatches: TicketMatch[];
  paymentDetails: PaymentDetail[];
}): WorkflowItem[] {
  const inboundById = new Map(input.inboundRecords.map((r) => [r.id, r]));
  const matchByMeasureId = new Map(
    input.ticketMatches.map((m) => [m.measureTicketId, m])
  );
  const paymentByMatchId = new Map(
    input.paymentDetails.map((p) => [p.matchId, p])
  );

  const items = input.measureTickets.map((measure) => {
    const match = matchByMeasureId.get(measure.id);
    const inbound = match?.inboundRecordId
      ? inboundById.get(match.inboundRecordId)
      : undefined;
    const payment = match ? paymentByMatchId.get(match.id) : undefined;

    const steps = [
      importStep(measure, inbound),
      verifyStep(match),
      paymentStep(match, payment),
    ];
    const overall = overallFromSteps(steps);

    return {
      ticketNo: measure.ticketNo,
      plateNo: measure.plateNo,
      driverName: measure.driverName,
      supplierName: measure.supplierName,
      businessDate:
        measure.grossTime?.slice(0, 10) ||
        measure.createdAt?.slice(0, 10) ||
        "",
      overallStatus: overall.status,
      overallLabel: overall.label,
      steps,
      measureId: measure.id,
      matchId: match?.id,
      paymentId: payment?.id,
    };
  });

  return items.sort((a, b) => b.businessDate.localeCompare(a.businessDate));
}

export function filterWorkflowItems(
  items: WorkflowItem[],
  filter: "all" | "in_progress" | "completed" | "blocked"
): WorkflowItem[] {
  if (filter === "all") return items;
  if (filter === "completed") {
    return items.filter((i) => i.overallStatus === "completed");
  }
  if (filter === "blocked") {
    return items.filter((i) => i.overallStatus === "blocked");
  }
  return items.filter((i) => i.overallStatus === "in_progress");
}
