Feature: Worked example 01 - steps and World

  @REQ-EC-022
  Scenario: Eating apples
    Given I have 3 apples
    When I eat 1 apples
    Then I have 2 apples left
