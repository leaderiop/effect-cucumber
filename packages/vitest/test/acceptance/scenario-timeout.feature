Feature: Scenario timeout tag

  @timeout-500 @REQ-EC-032
  Scenario: a scenario with a short timeout override runs normally
    Given the timeout log records "a scenario with a short timeout override runs normally"
    Then the timeout log contains "a scenario with a short timeout override runs normally"

  @timeout-30000
  Scenario: a scenario with a long timeout override runs normally
    Given the timeout log records "a scenario with a long timeout override runs normally"
    Then the timeout log contains "a scenario with a long timeout override runs normally"
