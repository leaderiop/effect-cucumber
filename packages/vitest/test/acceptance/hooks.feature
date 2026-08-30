Feature: Hook ordering

  @REQ-EC-016
  Scenario: The six hooks bracket the first scenario in the specified order
    When the scenario records "one"
    Then the hook log reads "BeforeAllScenarios,Before,BeforeStep,step:one,AfterStep,BeforeStep" with "BeforeAllScenarios" logged 1 time

  Scenario: The second scenario carries the first scenario's teardown and its own setup
    When the scenario records "two"
    Then the hook log reads "BeforeAllScenarios,Before,BeforeStep,step:one,AfterStep,BeforeStep,step:read,AfterStep,After,Before,BeforeStep,step:two,AfterStep,BeforeStep" with "BeforeAllScenarios" logged 1 time
