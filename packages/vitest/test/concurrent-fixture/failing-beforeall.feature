Feature: BeforeAllScenarios failure reporting under concurrent execution

  Scenario: first scenario individually reports the shared setup failure
    When nothing happens

  Scenario: second scenario individually reports the shared setup failure
    When nothing happens
