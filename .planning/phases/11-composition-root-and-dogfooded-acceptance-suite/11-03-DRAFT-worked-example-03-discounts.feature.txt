Feature: Worked example 03 - discounts

  Background:
    Given the cart contains:
      | item   | price |
      | Widget | 10.00 |
      | Gadget | 25.00 |

  @REQ-EC-004
  Scenario: The cart subtotal comes from the decoded table
    Then the cart subtotal is 35.00

  Rule: Percentage discounts expire at midnight

    @REQ-EC-015
    Scenario Outline: Applying a valid discount code
      Given a discount code "<code>" worth <percent>% expiring in "1 hour"
      When I apply the discount code "<code>"
      Then the total is <expected>

      Examples:
        | code   | percent | expected |
        | SAVE10 | 10      | 31.50    |
        | SAVE50 | 50      | 17.50    |

    @REQ-EC-014
    Scenario: Expired discount codes are rejected
      Given a discount code "OLD5" worth 5% expiring in "1 hour"
      When 2 hours pass
      And I apply the discount code "OLD5"
      Then the discount is rejected with "code expired"
