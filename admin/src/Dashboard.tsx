import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardActionArea from '@mui/material/CardActionArea';
import CardContent from '@mui/material/CardContent';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import { useQuery } from '@tanstack/react-query';
import { Loading, Title } from 'react-admin';
import { Link } from 'react-router-dom';
import { displayHryvnias } from './lib/money';
import { adminActions } from './providers/dataProvider';

/** A link to a list with filters set. */
const listLink = (resource: string, filter: object) =>
  `/${resource}?filter=${encodeURIComponent(JSON.stringify(filter))}`;

function Tile({
  label,
  value,
  to,
}: {
  label: string;
  value: number;
  to: string;
}) {
  return (
    <Card sx={{ minWidth: 160 }}>
      <CardActionArea component={Link} to={to}>
        <CardContent>
          <Typography variant="h4">{value}</Typography>
          <Typography color="text.secondary">{label}</Typography>
        </CardContent>
      </CardActionArea>
    </Card>
  );
}

export function Dashboard() {
  const { data, isPending, error } = useQuery({
    queryKey: ['admin-dashboard'],
    queryFn: async () => (await adminActions.dashboard()).data,
    refetchInterval: 60_000,
  });
  if (isPending) return <Loading />;
  if (error || !data)
    return <Typography color="error">The dashboard could not load.</Typography>;

  return (
    <Box sx={{ p: 2 }}>
      <Title title="SimpleFood" />
      <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mb: 3 }}>
        <Tile
          label="New orders"
          value={data.ordersByStatus.new}
          to={listLink('orders', { status: 'new' })}
        />
        <Tile
          label="Processing"
          value={data.ordersByStatus.processing}
          to={listLink('orders', { status: 'processing' })}
        />
        <Tile label="Orders today" value={data.ordersToday} to="/orders" />
        <Tile label="Last 7 days" value={data.ordersLast7Days} to="/orders" />
        <Tile
          label="New messages"
          value={data.unhandledMessages}
          to={listLink('contact-messages', { handled: 'false' })}
        />
      </Box>
      <Typography variant="h6">Latest orders</Typography>
      <Table size="small">
        <TableBody>
          {data.latestOrders.map((order) => (
            <TableRow
              key={order.id}
              hover
              component={Link}
              to={`/orders/${order.id}/show`}
              sx={{ textDecoration: 'none' }}
            >
              <TableCell>№{order.number}</TableCell>
              <TableCell>
                {new Date(order.createdAt).toLocaleString('uk-UA')}
              </TableCell>
              <TableCell>{order.name}</TableCell>
              <TableCell>{order.status}</TableCell>
              <TableCell align="right">
                {displayHryvnias(order.subtotal)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Box>
  );
}
