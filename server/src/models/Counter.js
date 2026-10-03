const { DataTypes } = require('sequelize');

// Atomic sequence numbers, e.g. for membership numbers and receipts
module.exports = (sequelize) => {
  const Counter = sequelize.define(
    'Counter',
    {
      name: { type: DataTypes.STRING(100), primaryKey: true },
      seq: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
    },
    { tableName: 'counters', timestamps: false }
  );

  // The upsert locks the row until the transaction ends, so two requests can never get the same number
  Counter.next = async (name, transaction) => {
    const run = async (t) => {
      await sequelize.query('INSERT INTO counters (name, seq) VALUES (?, 1) ON DUPLICATE KEY UPDATE seq = seq + 1', {
        replacements: [name],
        transaction: t,
      });
      const [rows] = await sequelize.query('SELECT seq FROM counters WHERE name = ?', { replacements: [name], transaction: t });
      return rows[0].seq;
    };
    return transaction ? run(transaction) : sequelize.transaction(run);
  };

  return Counter;
};
