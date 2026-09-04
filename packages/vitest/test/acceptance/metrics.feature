Feature: Effect.Metric at the Scenario emission boundary

  Scenario: A passing scenario runs cleanly
    Given a step that succeeds

  @retry
  @REQ-EC-029
  Scenario: A flaky step fails once then passes, and the retry is not double-counted
    Given the step fails on the first attempt and passes on the second
