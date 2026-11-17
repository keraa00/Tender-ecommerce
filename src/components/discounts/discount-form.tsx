"use client";

import { useActionState, useState, type ReactNode } from "react";

import { useAdminI18n } from "@/components/admin/admin-i18n";
import { ItemPicker, type PickerOption } from "@/components/discounts/item-picker";
import { DiscountStateBadge } from "@/components/ui/badge";
import { SaveBar, useDiscard } from "@/components/admin/save-bar";
import { Field, FormError, Input } from "@/components/ui/field";
import { cn } from "@/lib/cn";
import { parseDateTimeInput } from "@/lib/dates";
import type { DiscountFormState } from "@/lib/discounts/actions";
import {
  DISCOUNT_CODE_MAX_LENGTH,
  DISCOUNT_ELIGIBILITIES,
  DISCOUNT_MINIMUMS,
  DISCOUNT_SCOPES,
  DISCOUNT_TYPES,
  FULL_DISCOUNT_BPS,
} from "@/lib/discounts/constants";
import {
  describeDiscount,
  discountState,
  formatDiscountValue,
  parsePercentToBps,
  type DiscountFormat,
  type DiscountSummary,
} from "@/lib/discounts/format";
import type { DiscountFormValues } from "@/lib/discounts/form-values";
import { CUSTOMER_SEGMENTS, segmentHint } from "@/lib/discounts/segments";
import { format, plural } from "@/lib/i18n/format";
import type { AdminMessages } from "@/lib/i18n/admin";
import { currencySymbol, parseMoneyToCents } from "@/lib/money";

/**
 * Create and edit a discount. Every input is controlled, and the fields of the
 * types not chosen stay in state rather than being cleared, so a seller who
 * tries "Buy X get Y" and goes back to "Percentage" finds what they typed. Only
 * the chosen type's inputs are rendered, and the parser ignores the rest.
 *
 * The summary beside the form is `describeDiscount` — the same sentences the
 * discount list prints — run on the values as they are typed.
 */

type Options = {
  products: readonly PickerOption[];
  collections: readonly PickerOption[];
  customers: readonly PickerOption[];
};

type DiscountMessages = AdminMessages["discounts"];

/** The form's copy in the seller's language: what the browser needs, no more. */
export type DiscountFormCopy = Pick<
  DiscountMessages,
  "form" | "types" | "scopes" | "buysFrom" | "minimums" | "eligibilities" | "picker"
> & {
  format: AdminMessages["discountFormat"];
  segments: AdminMessages["segments"];
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Emails typed or pasted into the customer picker, lower-cased. */
function parseEmails(query: string): string[] {
  const parts = query.split(/[\s,;]+/).map((part) => part.trim().toLowerCase());
  return [...new Set(parts.filter((part) => EMAIL_PATTERN.test(part)))];
}

function wholeNumber(raw: string): number | null {
  return /^\d{1,9}$/.test(raw.trim()) ? Number(raw.trim()) : null;
}

function summaryOf(values: DiscountFormValues): DiscountSummary {
  const isBxgy = values.type === "BUY_X_GET_Y";
  const value =
    values.type === "PERCENTAGE"
      ? parsePercentToBps(values.percentValue)
      : values.type === "FIXED_AMOUNT"
        ? parseMoneyToCents(values.amountValue)
        : isBxgy
          ? values.getDiscount === "free"
            ? FULL_DISCOUNT_BPS
            : parsePercentToBps(values.getPercent)
          : 0;

  return {
    type: values.type,
    value: value ?? 0,
    appliesTo: values.type === "FREE_SHIPPING" ? "ALL" : values.appliesTo,
    productCount: values.productIds.length,
    collectionCount: values.collectionIds.length,
    buysFrom: isBxgy ? values.buysFrom : null,
    buyProductCount: values.buyProductIds.length,
    buyCollectionCount: values.buyCollectionIds.length,
    buyQuantity: wholeNumber(values.buyQuantity),
    getQuantity: wholeNumber(values.getQuantity),
    maxUsesPerOrder:
      isBxgy && values.limitUsesPerOrder ? wholeNumber(values.maxUsesPerOrder) : null,
    minSubtotalCents:
      !isBxgy && values.minimum === "SUBTOTAL" ? parseMoneyToCents(values.minSubtotal) : null,
    minQuantity:
      !isBxgy && values.minimum === "QUANTITY" ? wholeNumber(values.minQuantity) : null,
    eligibility: values.eligibility,
    segments: values.eligibility === "SEGMENTS" ? values.segments : [],
    customerCount: values.eligibility === "CUSTOMERS" ? values.customerEmails.length : 0,
    usageLimit: values.limitTotalUses ? wholeNumber(values.usageLimit) : null,
    perCustomerLimit: values.limitPerCustomer ? wholeNumber(values.perCustomerLimit) : null,
    combinable: values.combinable,
    startsAt: parseDateTimeInput(values.startsAt),
    endsAt: values.hasEndDate ? parseDateTimeInput(values.endsAt) : null,
  };
}

type DiscountFormProps = {
  action: (state: DiscountFormState, formData: FormData) => Promise<DiscountFormState>;
  initialValues: DiscountFormValues;
  options: Options;
  submitLabel: string;
  /** How often the discount has been used; 0 for a new one. */
  usageCount?: number;
  /**
   * The server's clock, as an ISO string. The status preview is rendered on
   * the server and again in the browser; reading the clock in each would let
   * the two disagree across a minute boundary.
   */
  now: string;
  /** Shown until the first save replaces it — "Discount created." after a create. */
  initialNotice?: string;
  /** The store's, ISO 4217: amounts are typed and summarised in it. */
  currency: string;
  t: DiscountFormCopy;
};

export function DiscountForm(props: DiscountFormProps) {
  const { key, discard } = useDiscard();
  return (
    <DiscountFormBody
      key={key}
      {...props}
      // Announces the create once; a discard after it is not news.
      initialNotice={key === 0 ? props.initialNotice : undefined}
      onDiscard={discard}
    />
  );
}

function DiscountFormBody({
  action,
  initialValues,
  options,
  submitLabel,
  usageCount = 0,
  now,
  initialNotice,
  currency,
  t: copy,
  onDiscard,
}: DiscountFormProps & { onDiscard: () => void }) {
  const { locale, intl } = useAdminI18n();
  const t = copy.form;
  const describe: DiscountFormat = { locale, intl, t: copy.format, segments: copy.segments };
  const symbol = currencySymbol(currency, intl);
  const [state, formAction, pending] = useActionState<DiscountFormState, FormData>(
    action,
    initialNotice ? { notice: initialNotice } : {},
  );
  const [values, setValues] = useState(initialValues);
  const errors = state.fieldErrors ?? {};
  const hasFieldErrors = Object.values(errors).some(Boolean);

  function set<K extends keyof DiscountFormValues>(key: K, value: DiscountFormValues[K]) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  const summary = summaryOf(values);
  const isBxgy = values.type === "BUY_X_GET_Y";
  const preview = discountState(
    {
      active: values.active,
      startsAt: summary.startsAt,
      endsAt: summary.endsAt,
      usageLimit: summary.usageLimit,
      usageCount,
    },
    new Date(now),
  );

  return (
    <form
      action={formAction}
      noValidate
      className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start"
    >
      <SaveBar
        label={submitLabel}
        pending={pending}
        onDiscard={onDiscard}
        savedKey={state.notice ? state : undefined}
      />

      <div className="min-w-0 space-y-6">
        <FormError>
          {state.formError ??
            (hasFieldErrors ? t.needsAttention : null)}
        </FormError>

        {state.notice ? (
          <p
            role="status"
            className="rounded-lg border border-success/30 bg-success/5 px-3 py-2 text-sm text-success"
          >
            {state.notice}
          </p>
        ) : null}

        {/* --- Method ------------------------------------------------------ */}
        <Card title={t.method}>
          <RadioCards
            name="method"
            value={values.method}
            onChange={(method) => set("method", method)}
            options={[
              { value: "code", ...t.codeMethod },
              { value: "automatic", ...t.automaticMethod },
            ]}
            columns="sm:grid-cols-2"
          />

          {values.method === "code" ? (
            <Field
              label={t.code}
              htmlFor="code"
              error={errors.code}
              hint={t.codeHint}
            >
              <Input
                id="code"
                name="code"
                value={values.code}
                onChange={(event) => set("code", event.target.value.toUpperCase())}
                placeholder={t.codePlaceholder}
                dir="ltr"
                autoComplete="off"
                spellCheck={false}
                maxLength={DISCOUNT_CODE_MAX_LENGTH}
                className="font-mono tracking-wide uppercase placeholder:font-sans placeholder:normal-case placeholder:tracking-normal"
                aria-invalid={Boolean(errors.code)}
              />
            </Field>
          ) : null}

          <Field
            label={t.title}
            htmlFor="title"
            error={errors.title}
            hint={values.method === "code" ? t.titleHintCode : t.titleHintAutomatic}
          >
            <Input
              id="title"
              name="title"
              value={values.title}
              onChange={(event) => set("title", event.target.value)}
              placeholder={
                values.method === "code" ? t.titlePlaceholderCode : t.titlePlaceholderAutomatic
              }
              autoComplete="off"
              aria-invalid={Boolean(errors.title)}
            />
          </Field>
        </Card>

        {/* --- Type and value ---------------------------------------------- */}
        <Card title={t.type} error={errors.type}>
          <RadioCards
            name="type"
            value={values.type}
            onChange={(type) => set("type", type)}
            options={DISCOUNT_TYPES.map((value) => ({ value, ...copy.types[value] }))}
            columns="sm:grid-cols-2"
          />

          {values.type === "PERCENTAGE" ? (
            <Field label={t.percentageOff} htmlFor="percentValue" error={errors.value}>
              <Affixed suffix="%" className="max-w-40">
                <Input
                  id="percentValue"
                  name="percentValue"
                  inputMode="decimal"
                  value={values.percentValue}
                  onChange={(event) => set("percentValue", event.target.value)}
                  placeholder="10"
                  className="border-0 bg-transparent focus-visible:outline-none"
                  aria-invalid={Boolean(errors.value)}
                />
              </Affixed>
            </Field>
          ) : null}

          {values.type === "FIXED_AMOUNT" ? (
            <Field
              label={t.amountOff}
              htmlFor="amountValue"
              error={errors.value}
              hint={t.amountOffHint}
            >
              <Affixed prefix={symbol} className="max-w-40">
                <Input
                  id="amountValue"
                  name="amountValue"
                  inputMode="decimal"
                  value={values.amountValue}
                  onChange={(event) => set("amountValue", event.target.value)}
                  placeholder="10.00"
                  className="border-0 bg-transparent ps-1 focus-visible:outline-none"
                  aria-invalid={Boolean(errors.value)}
                />
              </Affixed>
            </Field>
          ) : null}

          {values.type === "FREE_SHIPPING" ? (
            <p className="text-sm text-muted text-pretty">
              {format(t.freeShippingNote, { symbol })}
            </p>
          ) : null}
        </Card>

        {/* --- Buy X get Y -------------------------------------------------- */}
        {isBxgy ? (
          <>
            <Card title={t.customerBuys} error={errors.buysFrom}>
              <QuantityField
                id="buyQuantity"
                label={t.quantity}
                value={values.buyQuantity}
                onChange={(value) => set("buyQuantity", value)}
                error={errors.buyQuantity}
              />
              <ScopeChooser
                name="buysFrom"
                legend={t.from}
                value={values.buysFrom}
                onChange={(scope) => set("buysFrom", scope)}
                scopeOptions={DISCOUNT_SCOPES.map((value) => ({ value, label: copy.buysFrom[value] }))}
                t={copy}
                productName="buyProductId"
                collectionName="buyCollectionId"
                productIds={values.buyProductIds}
                collectionIds={values.buyCollectionIds}
                onProducts={(ids) => set("buyProductIds", ids)}
                onCollections={(ids) => set("buyCollectionIds", ids)}
                options={options}
                invalid={Boolean(errors.buysFrom)}
              />
            </Card>

            <Card title={t.customerGets} error={errors.appliesTo}>
              <p className="text-sm text-muted text-pretty">{t.getsNote}</p>
              <QuantityField
                id="getQuantity"
                label={t.quantity}
                value={values.getQuantity}
                onChange={(value) => set("getQuantity", value)}
                error={errors.getQuantity}
              />
              <ScopeChooser
                name="appliesTo"
                legend={t.from}
                value={values.appliesTo}
                onChange={(scope) => set("appliesTo", scope)}
                scopeOptions={DISCOUNT_SCOPES.map((value) => ({ value, label: copy.buysFrom[value] }))}
                t={copy}
                productName="productId"
                collectionName="collectionId"
                productIds={values.productIds}
                collectionIds={values.collectionIds}
                onProducts={(ids) => set("productIds", ids)}
                onCollections={(ids) => set("collectionIds", ids)}
                options={options}
                invalid={Boolean(errors.appliesTo)}
              />

              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">{t.atDiscountOf}</legend>
                <RadioRow
                  name="getDiscount"
                  value="free"
                  checked={values.getDiscount === "free"}
                  onChange={() => set("getDiscount", "free")}
                >
                  {t.free}
                </RadioRow>
                <RadioRow
                  name="getDiscount"
                  value="percentage"
                  checked={values.getDiscount === "percentage"}
                  onChange={() => set("getDiscount", "percentage")}
                >
                  {t.percentageOff}
                </RadioRow>
                {values.getDiscount === "percentage" ? (
                  <div className="ps-6">
                    <Affixed suffix="%" className="max-w-32">
                      <Input
                        name="getPercent"
                        aria-label={t.percentageOffEach}
                        inputMode="decimal"
                        value={values.getPercent}
                        onChange={(event) => set("getPercent", event.target.value)}
                        className="border-0 bg-transparent focus-visible:outline-none"
                        aria-invalid={Boolean(errors.value)}
                      />
                    </Affixed>
                  </div>
                ) : null}
                <ErrorText>{errors.value}</ErrorText>
              </fieldset>

              <LimitToggle
                name="limitUsesPerOrder"
                label={t.limitPerOrder}
                checked={values.limitUsesPerOrder}
                onCheckedChange={(checked) => set("limitUsesPerOrder", checked)}
                inputName="maxUsesPerOrder"
                inputLabel={t.timesPerOrder}
                value={values.maxUsesPerOrder}
                onValueChange={(value) => set("maxUsesPerOrder", value)}
                error={errors.maxUsesPerOrder}
              />
            </Card>
          </>
        ) : null}

        {/* --- Applies to --------------------------------------------------- */}
        {values.type === "PERCENTAGE" || values.type === "FIXED_AMOUNT" ? (
          <Card title={t.appliesTo} error={errors.appliesTo}>
            <ScopeChooser
              name="appliesTo"
              value={values.appliesTo}
              onChange={(scope) => set("appliesTo", scope)}
              scopeOptions={DISCOUNT_SCOPES.map((value) => ({ value, label: copy.scopes[value] }))}
              t={copy}
              productName="productId"
              collectionName="collectionId"
              productIds={values.productIds}
              collectionIds={values.collectionIds}
              onProducts={(ids) => set("productIds", ids)}
              onCollections={(ids) => set("collectionIds", ids)}
              options={options}
              invalid={Boolean(errors.appliesTo)}
            />
          </Card>
        ) : null}

        {/* --- Minimum ------------------------------------------------------ */}
        {!isBxgy ? (
          <Card title={t.minimum} error={errors.minimum}>
            <fieldset className="space-y-2">
              <legend className="sr-only">{t.minimumLegend}</legend>
              {DISCOUNT_MINIMUMS.map((minimum) => (
                <div key={minimum} className="space-y-2">
                  <RadioRow
                    name="minimum"
                    value={minimum}
                    checked={values.minimum === minimum}
                    onChange={() => set("minimum", minimum)}
                  >
                    {copy.minimums[minimum]}
                  </RadioRow>

                  {minimum === "SUBTOTAL" && values.minimum === "SUBTOTAL" ? (
                    <div className="ps-6">
                      <Affixed prefix={symbol} className="max-w-40">
                        <Input
                          name="minSubtotal"
                          aria-label={copy.minimums.SUBTOTAL}
                          inputMode="decimal"
                          value={values.minSubtotal}
                          onChange={(event) => set("minSubtotal", event.target.value)}
                          placeholder="50.00"
                          className="border-0 bg-transparent ps-1 focus-visible:outline-none"
                          aria-invalid={Boolean(errors.minimum)}
                        />
                      </Affixed>
                    </div>
                  ) : null}

                  {minimum === "QUANTITY" && values.minimum === "QUANTITY" ? (
                    <div className="ps-6">
                      <Input
                        name="minQuantity"
                        aria-label={copy.minimums.QUANTITY}
                        inputMode="numeric"
                        value={values.minQuantity}
                        onChange={(event) => set("minQuantity", event.target.value)}
                        placeholder="3"
                        className="max-w-40"
                        aria-invalid={Boolean(errors.minimum)}
                      />
                    </div>
                  ) : null}
                </div>
              ))}
            </fieldset>
            {values.minimum !== "NONE" && values.type !== "FREE_SHIPPING" && values.appliesTo !== "ALL" ? (
              <p className="text-sm text-muted">{t.minimumNote}</p>
            ) : null}
          </Card>
        ) : null}

        {/* --- Eligibility --------------------------------------------------- */}
        <Card title={t.eligibility} error={errors.eligibility}>
          <fieldset className="space-y-2">
            <legend className="sr-only">{t.whoCanUse}</legend>
            {DISCOUNT_ELIGIBILITIES.map((eligibility) => (
              <RadioRow
                key={eligibility}
                name="eligibility"
                value={eligibility}
                checked={values.eligibility === eligibility}
                onChange={() => set("eligibility", eligibility)}
              >
                {copy.eligibilities[eligibility]}
              </RadioRow>
            ))}
          </fieldset>

          {values.eligibility === "SEGMENTS" ? (
            <fieldset className="grid gap-2 sm:grid-cols-2">
              <legend className="sr-only">{t.segments}</legend>
              {CUSTOMER_SEGMENTS.map((segment) => (
                <label
                  key={segment}
                  className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-border-strong bg-surface px-3 py-2.5 has-checked:border-foreground"
                >
                  <input
                    type="checkbox"
                    name="segment"
                    value={segment}
                    checked={values.segments.includes(segment)}
                    onChange={(event) =>
                      set(
                        "segments",
                        event.target.checked
                          ? [...values.segments, segment]
                          : values.segments.filter((entry) => entry !== segment),
                      )
                    }
                    className="mt-0.5"
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{copy.segments[segment].label}</span>
                    <span className="block text-xs text-muted">
                      {segmentHint(segment, copy.segments)}
                    </span>
                  </span>
                </label>
              ))}
            </fieldset>
          ) : null}

          {values.eligibility === "CUSTOMERS" ? (
            <ItemPicker
              name="customerEmail"
              label={t.findCustomers}
              options={options.customers}
              selected={values.customerEmails}
              onChange={(emails) => set("customerEmails", emails)}
              placeholder={t.customersPlaceholder}
              empty={t.customersEmpty}
              t={copy.picker}
              parseEntry={parseEmails}
              invalid={Boolean(errors.eligibility)}
            />
          ) : null}

          {values.eligibility !== "ALL" ? (
            <p className="text-sm text-muted text-pretty">
              {values.method === "automatic" ? t.eligibilityNoteAutomatic : t.eligibilityNote}
            </p>
          ) : null}
        </Card>

        {/* --- Usage limits -------------------------------------------------- */}
        <Card title={t.maxUses}>
          <LimitToggle
            name="limitTotalUses"
            label={t.limitTotal}
            checked={values.limitTotalUses}
            onCheckedChange={(checked) => set("limitTotalUses", checked)}
            inputName="usageLimit"
            inputLabel={t.totalUses}
            value={values.usageLimit}
            onValueChange={(value) => set("usageLimit", value)}
            error={errors.usageLimit}
            hint={usageCount > 0 ? plural(locale, usageCount, t.usedSoFar) : undefined}
          />
          <LimitToggle
            name="limitPerCustomer"
            label={t.limitPerCustomer}
            checked={values.limitPerCustomer}
            onCheckedChange={(checked) => set("limitPerCustomer", checked)}
            inputName="perCustomerLimit"
            inputLabel={t.usesPerCustomer}
            value={values.perCustomerLimit}
            onValueChange={(value) => set("perCustomerLimit", value)}
            error={errors.perCustomerLimit}
            hint={t.perCustomerHint}
          />
        </Card>

        {/* --- Combinations -------------------------------------------------- */}
        <Card title={t.combinations}>
          <Switch
            name="combinable"
            checked={values.combinable}
            onChange={(checked) => set("combinable", checked)}
            label={t.combinable}
            hint={values.combinable ? t.combinableHint : t.notCombinableHint}
          />
        </Card>

        {/* --- Schedule ------------------------------------------------------ */}
        <Card title={t.activeDates}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t.start} htmlFor="startsAt" error={errors.startsAt}>
              <Input
                id="startsAt"
                name="startsAt"
                type="datetime-local"
                value={values.startsAt}
                onChange={(event) => set("startsAt", event.target.value)}
                aria-invalid={Boolean(errors.startsAt)}
              />
            </Field>

            {values.hasEndDate ? (
              <Field label={t.end} htmlFor="endsAt" error={errors.endsAt}>
                <Input
                  id="endsAt"
                  name="endsAt"
                  type="datetime-local"
                  value={values.endsAt}
                  min={values.startsAt || undefined}
                  onChange={(event) => set("endsAt", event.target.value)}
                  aria-invalid={Boolean(errors.endsAt)}
                />
              </Field>
            ) : null}
          </div>

          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="hasEndDate"
              checked={values.hasEndDate}
              onChange={(event) => set("hasEndDate", event.target.checked)}
            />
            {t.setEndDate}
          </label>
          <p className="text-sm text-muted">{t.utcNote}</p>
        </Card>
      </div>

      {/* --- Sidebar ---------------------------------------------------------- */}
      <aside className="space-y-4 lg:sticky lg:top-6">
        <div className="space-y-4 rounded-xl border border-border bg-surface p-5">
          <Switch
            name="active"
            checked={values.active}
            onChange={(checked) => set("active", checked)}
            label={t.active}
            hint={values.active ? t.activeHint : t.inactiveHint}
          />
          <div className="flex items-center justify-between gap-3 border-t border-border pt-4 text-sm">
            <span className="text-muted">{t.status}</span>
            <DiscountStateBadge state={preview} />
          </div>
        </div>

        <div className="rounded-xl border border-border bg-surface p-5">
          <h2 className="text-sm font-medium">{t.summary}</h2>
          <p className="mt-3 flex flex-wrap items-baseline gap-2">
            {values.method === "code" ? (
              <code className="rounded bg-surface-subtle px-1.5 py-0.5 font-mono text-sm font-medium ring-1 ring-border ring-inset">
                {values.code.trim() || t.noCodeYet}
              </code>
            ) : (
              <span className="text-sm font-medium">{values.title.trim() || t.untitled}</span>
            )}
            <span className="text-xs text-muted">
              {values.method === "code" ? t.codeLabel : t.automaticLabel}
            </span>
          </p>
          <p className="mt-2 text-sm font-medium tabular">
            {summary.value > 0 || values.type === "FREE_SHIPPING"
              ? formatDiscountValue(
                  {
                    type: summary.type,
                    value: summary.value,
                    buyQuantity: summary.buyQuantity,
                    getQuantity: summary.getQuantity,
                  },
                  currency,
                  describe,
                )
              : t.enterValue}
          </p>
          <ul className="mt-3 list-disc space-y-1.5 ps-4 text-sm text-muted marker:text-border-strong">
            {describeDiscount(summary, currency, describe).map((line) => (
              <li key={line} className="text-pretty">
                {line}
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

function Card({
  title,
  error,
  children,
}: {
  title: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-4 rounded-xl border border-border bg-surface p-5">
      <h2 className="text-sm font-medium tracking-tight">{title}</h2>
      {children}
      <ErrorText>{error}</ErrorText>
    </section>
  );
}

function ErrorText({ children }: { children?: string }) {
  if (!children) return null;
  return (
    <p className="text-sm text-danger" role="alert">
      {children}
    </p>
  );
}

function RadioCards<T extends string>({
  name,
  value,
  onChange,
  options,
  columns,
}: {
  name: string;
  value: T;
  onChange: (value: T) => void;
  options: readonly { value: T; label: string; hint: string }[];
  columns: string;
}) {
  return (
    <div className={cn("grid gap-2", columns)}>
      {options.map((option) => (
        <label
          key={option.value}
          className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-border-strong bg-surface px-3 py-2.5 has-checked:border-foreground has-checked:bg-surface-hover"
        >
          <input
            type="radio"
            name={name}
            value={option.value}
            checked={value === option.value}
            onChange={() => onChange(option.value)}
            className="mt-0.5"
          />
          <span className="min-w-0">
            <span className="block text-sm font-medium">{option.label}</span>
            <span className="block text-xs text-muted">{option.hint}</span>
          </span>
        </label>
      ))}
    </div>
  );
}

function RadioRow({
  name,
  value,
  checked,
  onChange,
  children,
}: {
  name: string;
  value: string;
  checked: boolean;
  onChange: () => void;
  children: ReactNode;
}) {
  return (
    <label className="flex w-fit cursor-pointer items-center gap-2 text-sm">
      <input type="radio" name={name} value={value} checked={checked} onChange={onChange} />
      {children}
    </label>
  );
}

function Affixed({
  prefix,
  suffix,
  className,
  children,
}: {
  prefix?: string;
  suffix?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex items-center rounded-lg border border-border-strong bg-surface focus-within:border-foreground has-aria-invalid:border-danger",
        className,
      )}
    >
      {prefix ? <span className="ps-3 text-sm text-muted select-none">{prefix}</span> : null}
      {children}
      {suffix ? <span className="pe-3 text-sm text-muted select-none">{suffix}</span> : null}
    </div>
  );
}

function QuantityField({
  id,
  label,
  value,
  onChange,
  error,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
}) {
  return (
    <Field label={label} htmlFor={id} error={error}>
      <Input
        id={id}
        name={id}
        inputMode="numeric"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="max-w-32"
        aria-invalid={Boolean(error)}
      />
    </Field>
  );
}

function ScopeChooser({
  name,
  legend,
  value,
  onChange,
  scopeOptions,
  productName,
  collectionName,
  productIds,
  collectionIds,
  onProducts,
  onCollections,
  options,
  invalid,
  t,
}: {
  name: string;
  legend?: string;
  value: DiscountFormValues["appliesTo"];
  onChange: (value: DiscountFormValues["appliesTo"]) => void;
  scopeOptions: readonly { value: DiscountFormValues["appliesTo"]; label: string }[];
  productName: string;
  collectionName: string;
  productIds: string[];
  collectionIds: string[];
  onProducts: (ids: string[]) => void;
  onCollections: (ids: string[]) => void;
  options: Options;
  invalid: boolean;
  t: DiscountFormCopy;
}) {
  return (
    <div className="space-y-3">
      <fieldset className="flex flex-wrap gap-x-5 gap-y-2">
        <legend className={legend ? "mb-2 text-sm font-medium" : "sr-only"}>
          {legend ?? t.form.scope}
        </legend>
        {scopeOptions.map((option) => (
          <RadioRow
            key={option.value}
            name={name}
            value={option.value}
            checked={value === option.value}
            onChange={() => onChange(option.value)}
          >
            {option.label}
          </RadioRow>
        ))}
      </fieldset>

      {value === "PRODUCT" ? (
        <ItemPicker
          name={productName}
          label={t.form.findProducts}
          options={options.products}
          selected={productIds}
          onChange={onProducts}
          placeholder={t.form.searchProducts}
          empty={t.form.productsEmpty}
          t={t.picker}
          invalid={invalid}
        />
      ) : null}

      {value === "COLLECTION" ? (
        <ItemPicker
          name={collectionName}
          label={t.form.findCollections}
          options={options.collections}
          selected={collectionIds}
          onChange={onCollections}
          placeholder={t.form.searchCollections}
          empty={t.form.collectionsEmpty}
          t={t.picker}
          invalid={invalid}
        />
      ) : null}
    </div>
  );
}

function LimitToggle({
  name,
  label,
  checked,
  onCheckedChange,
  inputName,
  inputLabel,
  value,
  onValueChange,
  error,
  hint,
}: {
  name: string;
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  inputName: string;
  inputLabel: string;
  value: string;
  onValueChange: (value: string) => void;
  error?: string;
  hint?: string;
}) {
  return (
    <div className="space-y-2">
      <label className="flex w-fit cursor-pointer items-center gap-2 text-sm">
        <input
          type="checkbox"
          name={name}
          checked={checked}
          onChange={(event) => onCheckedChange(event.target.checked)}
        />
        {label}
      </label>
      {checked ? (
        <div className="space-y-1.5 ps-6">
          <Input
            name={inputName}
            aria-label={inputLabel}
            inputMode="numeric"
            value={value}
            onChange={(event) => onValueChange(event.target.value)}
            className="max-w-32"
            aria-invalid={Boolean(error)}
          />
          <ErrorText>{error}</ErrorText>
          {!error && hint ? <p className="text-xs text-muted">{hint}</p> : null}
        </div>
      ) : null}
    </div>
  );
}

function Switch({
  name,
  checked,
  onChange,
  label,
  hint,
}: {
  name: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4">
      <span className="min-w-0">
        <span className="block text-sm font-medium">{label}</span>
        {hint ? <span className="mt-0.5 block text-sm text-muted text-pretty">{hint}</span> : null}
      </span>
      <input
        type="checkbox"
        role="switch"
        name={name}
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="peer sr-only"
      />
      <span
        aria-hidden
        className="relative mt-0.5 h-5 w-9 shrink-0 rounded-full bg-border-strong transition-colors peer-checked:bg-primary peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring after:absolute after:top-0.5 after:start-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:shadow-sm after:transition-transform peer-checked:after:translate-x-4 rtl:peer-checked:after:-translate-x-4"
      />
    </label>
  );
}
