Feature: Step modules

  @REQ-EC-023
  Scenario: A module used at Feature level serves a Scenario
    Given I have 3 apples
    When I eat 1 apples
    Then I have 2 apples left

  Rule: A module used inside a Rule is scoped to it

    Scenario: The Rule's Scenario reaches both the Feature-level and the Rule-level module
      Given I have 5 apples
      Then the rule module reports 5 apples
