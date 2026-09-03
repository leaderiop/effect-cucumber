Feature: A deliberately failing Scenario for the failure-panel gate

  Scenario: Adding apples the wrong way
    Given I have 3 apples
    When I add 2 more apples
    Then I should have 6 apples
