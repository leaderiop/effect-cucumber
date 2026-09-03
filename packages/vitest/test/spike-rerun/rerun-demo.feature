Feature: Rerun failed only spike

  Scenario: Scenario A passes
    Given scenario A runs
    Then it passes

  Scenario: Scenario B fails
    Given scenario B runs
    Then it deliberately fails

  Scenario: Scenario C passes
    Given scenario C runs
    Then it passes
