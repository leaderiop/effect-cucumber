Feature: Worked example 01 - steps and World

  @REQ-EC-022
  Scenario: Eating apples
    Given I have 3 apples
    When I eat 1 apples
    Then I have 2 apples left

  @REQ-EC-011
  Scenario: A bare generator step body is registered and run
    When I double 21 apples
    Then the doubled count is 42

  @REQ-EC-012
  Scenario: A World field is typed and reachable
    Given I put "cox" and "gala" in the basket
    Then the basket holds "cox,gala"

  @REQ-EC-010
  Scenario: A step reaches a service the ambient Layer provides
    Given a step resolves the ambient World service
    Then the resolved World reported "0 apples, 0 in the basket"
