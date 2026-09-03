Feature: A Scenario tagged @retry

  @retry
  @REQ-EC-026
  Scenario: A flaky step passes on retry and rebuilds its Layer fresh
    Given the per-scenario Layer build ordinal is observed
    When the step fails on the first attempt and passes on the second
    Then the scenario is reported passing and the Layer was built fresh for each attempt
