@featuretag
Feature: Parsing and matching

  Background:
    Given the recorder is empty

  @REQ-EC-001
  Scenario: A second loaded feature is data and nothing else
    Then the second loaded feature is named "Parsing and matching, the second load"
    And the second loaded feature holds 2 scenarios

  @REQ-EC-002
  Scenario: Correlation reaches the step
    Then the first step of this scenario carries the Background origin
    And this scenario carries the feature-level tag it inherited
    And the sibling outline's names arrived interpolated
    And the recorder holds "the recorder is empty,feature-background,@featuretag,interpolated"

  @REQ-EC-017
  Scenario: Background steps lead and the Scenario's own follow
    When I record "first"
    And I record "second"
    Then the recorder holds "the recorder is empty,first,second"

  Scenario Outline: Substituted placeholders reach the step for <number>
    Then the substituted number <number> doubles to <doubled>

    Examples:
      | number | doubled |
      | 7      | 14      |
      | 11     | 22      |
