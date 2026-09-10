Feature: A fixture for the GherkinJUnitReporter gate

  @smoke
  Scenario: A passing Scenario that attaches evidence
    Given I attach the order total as evidence
    When the order total is computed
    Then I should have a total of 42

  Scenario: A deliberately failing Scenario
    Given I attach the order total as evidence
    When the order total is computed
    Then I should have a total of 999
