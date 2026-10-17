#pragma once
#include <stdint.h>
#include <stdio.h>

namespace StoryCalendar {
struct Parts { int year, month, day; int64_t seconds; };
inline int monthDays(int year, int month) {
  const int lengths[] = {31,28,31,30,31,30,31,31,30,31,30,31};
  return lengths[month - 1] + (month == 2 && year % 4 == 0 && (year % 100 != 0 || year % 400 == 0));
}
inline int yearDays(int year) { return monthDays(year, 2) == 29 ? 366 : 365; }
inline Parts split(int64_t wall) {
  int64_t days = wall / 86400, seconds = wall % 86400;
  if (seconds < 0) { seconds += 86400; --days; }
  int year = 1970, month = 1;
  while (days < 0) { --year; days += yearDays(year); }
  while (days >= yearDays(year)) { days -= yearDays(year); ++year; }
  while (days >= monthDays(year, month)) { days -= monthDays(year, month); ++month; }
  return {year, month, (int)days + 1, seconds};
}
inline int64_t join(int year, int month, int day, int64_t seconds) {
  int64_t days = 0;
  for (int y = 1970; y < year; ++y) days += yearDays(y);
  for (int y = year; y < 1970; ++y) days -= yearDays(y);
  for (int m = 1; m < month; ++m) days += monthDays(year, m);
  return (days + day - 1) * 86400 + seconds;
}
inline int64_t anniversary(const Parts& start, int months) {
  const int year = start.year + (start.month - 1 + months) / 12;
  const int month = (start.month - 1 + months) % 12 + 1;
  const int last = monthDays(year, month);
  return join(year, month, start.day < last ? start.day : last, start.seconds);
}
inline void format(char* output, size_t size, int64_t startWall, int64_t nowWall) {
  if (nowWall < startWall) nowWall = startWall;
  const Parts start = split(startWall), now = split(nowWall);
  int months = (now.year - start.year) * 12 + now.month - start.month;
  if (months > 0 && anniversary(start, months) > nowWall) --months;
  const int days = (int)((nowWall - anniversary(start, months)) / 86400);
  snprintf(output, size, "%dy %dm %dd", months / 12, months % 12, days);
}
}
