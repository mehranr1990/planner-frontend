import { typedAs, type ApiClient, type ResponseDataIn } from "@/api/client";
import type { paths } from "@/api/generated/openapi-p6-personal";
import type { CapacityDay, ScheduleCapacity, WorkingHours, WorkingHoursRepository, WorkingHoursState } from "../personal-services";
import { invalid, mapErrors, retryOnConflict, revisionTag } from "./api-shared";

/*
 * Working hours over /planning/working-hours (account settings revision as
 * ETag; seven interval arrays, Sunday = 0, plus explicit date exceptions).
 * PUT replaces the whole configuration, so every write reads first and
 * applies the caller's change to the latest hours; a 409 re-reads and
 * re-applies (untouched days and exceptions are preserved). Capacity
 * reads /planning/capacity/schedule for one day or one account week;
 * UNKNOWN / DST_GAP stay null, never invented.
 */

type ApiState = ResponseDataIn<paths, "/api/v1/planning/working-hours", "get">;
type ApiCapacity = ResponseDataIn<paths, "/api/v1/planning/capacity/schedule", "get">;

const TIME = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

const toState = (dto: ApiState): WorkingHoursState => ({
  workingHours: dto.workingHours
    ? {
        intervalsByWeekday: dto.workingHours.intervalsByWeekday.map((day) => day.map(({ start, end }) => ({ start, end }))),
        exceptions: dto.workingHours.exceptions.map(({ date, intervals }) => ({ date, intervals: intervals.map(({ start, end }) => ({ start, end })) })),
      }
    : null,
  revision: dto.revision,
  timezone: dto.timezone,
  firstDayOfWeek: dto.firstDayOfWeek,
});

function check(hours: WorkingHours) {
  const intervals = (list: { start: string; end: string }[]) => {
    if (list.length > 16) invalid("At most 16 intervals a day");
    const sorted = [...list].sort((a, b) => a.start.localeCompare(b.start));
    sorted.forEach((item, index) => {
      if (!TIME.test(item.start) || !TIME.test(item.end) || item.end <= item.start) invalid("An interval is HH:mm–HH:mm, end after start");
      if (index > 0 && item.start < sorted[index - 1]!.end) invalid("Intervals must not overlap");
    });
  };
  if (hours.intervalsByWeekday.length !== 7) invalid("Seven weekdays are required");
  hours.intervalsByWeekday.forEach(intervals);
  if (hours.exceptions.length > 366 || new Set(hours.exceptions.map((item) => item.date)).size !== hours.exceptions.length) invalid("Exceptions must be distinct days");
  hours.exceptions.forEach((item) => {
    if (!DAY.test(item.date)) invalid("An exception needs a day");
    intervals(item.intervals);
  });
}

const toDay = (dto: ApiCapacity["days"][number]): CapacityDay => ({
  date: dto.date,
  state: dto.state,
  availableMinutes: dto.availableMinutes,
  busyMinutes: dto.busyMinutes,
  reservedMinutes: dto.reservedMinutes,
  remainingMinutes: dto.remainingMinutes,
  overbookedMinutes: dto.overbookedMinutes,
});

export function createApiWorkingHoursRepository(client: ApiClient): WorkingHoursRepository {
  const api = typedAs<paths>(client);
  const read = async () => toState((await api.request("get", "/api/v1/planning/working-hours", {})).data);

  return {
    get: () => mapErrors(read),

    update: (apply) =>
      mapErrors(async () => {
        let latest = await read();
        const dto = await retryOnConflict(
          async () => {
            const next = apply(latest.workingHours);
            if (next) check(next);
            return (await api.request("put", "/api/v1/planning/working-hours", { header: { "If-Match": revisionTag(latest.revision) }, body: { workingHours: next } })).data;
          },
          async () => {
            latest = await read();
          },
        );
        return toState(dto);
      }),

    capacity: (query) =>
      mapErrors(async () => {
        const day = "date" in query ? query.date : query.weekStartDate;
        if (!DAY.test(day)) invalid("A capacity day is YYYY-MM-DD");
        const { data } = await api.request("get", "/api/v1/planning/capacity/schedule", { query });
        const capacity: ScheduleCapacity = {
          state: data.state,
          days: data.days.map(toDay),
          availableMinutes: data.availableMinutes,
          reservedMinutes: data.reservedMinutes,
          remainingMinutes: data.remainingMinutes,
          overbookedMinutes: data.overbookedMinutes,
        };
        return capacity;
      }),
  };
}
